'use client';
/* oxlint-disable react/react-compiler -- Synchronizes URL entry and cancellable form-token requests. */
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { CheckCircle2, LoaderCircle, MessageSquareText, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import './site-feedback.css';

const requestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)),byte => byte.toString(16).padStart(2,'0')).join('');
type FormToken = {csrf?:string;error?:string;secure_url?:string};
export function SiteFeedback({open,onOpenChange,year,context}: {open:boolean;onOpenChange:(open:boolean)=>void;year:number;context:string}) {
  const [privacy,setPrivacy] = useState(false);
  const [phone,setPhone] = useState('');
  const [content,setContent] = useState('');
  const [category,setCategory] = useState('纠正错误');
  const [consent,setConsent] = useState(false);
  const [website,setWebsite] = useState('');
  const [token,setToken] = useState('');
  const lastSubmission = useRef<{key:string;id:string}|null>(null);
  const [loading,setLoading] = useState(false);
  const [submitting,setSubmitting] = useState(false);
  const [error,setError] = useState('');
  const [secureUrl,setSecureUrl] = useState('');
  const [saved,setSaved] = useState<number|null>(null);
  const [attempt,setAttempt] = useState(0);
  const [carriedContext,setCarriedContext] = useState<{year:number;context:string}|null>(null);
  useEffect(() => {
    const url=new URL(window.location.href);
    if(url.searchParams.get('feedback')==='1'){
      const y=Number(url.searchParams.get('feedback_year'));
      if(y>=1368&&y<=1644)setCarriedContext({year:y,context:(url.searchParams.get('feedback_context')||context).slice(0,180)});
      onOpenChange(true);
      for(const key of ['feedback','feedback_year','feedback_context'])url.searchParams.delete(key);
      window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
    }
  },[onOpenChange,context]);
  useEffect(() => {
    if(!open)return;
    const controller=new AbortController();let active=true;setLoading(true);setError('');setToken('');setSecureUrl('');
    const timer=window.setTimeout(()=>controller.abort(),8000);
    fetch('/api/feedback.php',{signal:controller.signal,credentials:'same-origin',cache:'no-store'})
      .then(async response => {const value=await response.json() as FormToken;if(controller.signal.aborted)return;if(value.secure_url){const url=new URL(value.secure_url);if(url.origin!=='https://dmwc.cc')throw new Error('反馈连接无效。');url.searchParams.set('feedback_year',String(year));url.searchParams.set('feedback_context',context);setSecureUrl(url.href);return;}if(!response.ok||!value.csrf)throw new Error(value.error||'暂时无法打开反馈表单。');setToken(value.csrf);})
      .catch(failure => {if(active)setError(controller.signal.aborted?'连接超时，请重试。':failure instanceof Error?failure.message:'反馈服务暂不可用。');})
      .finally(()=>{clearTimeout(timer);if(active)setLoading(false);});
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[open,attempt,year,context]);
  const submit=async(event:SyntheticEvent<HTMLFormElement>)=>{
    event.preventDefault();if(submitting||!token)return;
    const cleanPhone=phone.replace(/[\s()-]/g,'');
    if(!/^\+?[1-9][0-9]{6,14}$/.test(cleanPhone)){setError('请填写有效的手机号。');return;}
    const text=content.trim();if(Array.from(text).length<5||Array.from(text).length>3000){setError('反馈内容请填写5至3000字。');return;}
    if(!consent){setError('请确认手机号的使用说明。');return;}
    setSubmitting(true);setError('');
    const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),10000);
    try{
      const payload={phone:cleanPhone,content:text,category,consent,website,year:carriedContext?.year||year,context:carriedContext?.context||context};
      const key=JSON.stringify(payload);
      if(lastSubmission.current?.key!==key)lastSubmission.current={key,id:requestId()};
      const response=await fetch('/api/feedback.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({...payload,csrf:token,request_id:lastSubmission.current.id})});
      const result=await response.json() as {ok?:boolean;id?:number;error?:string;expired?:boolean};
      if(!response.ok||!result.ok||!Number.isSafeInteger(result.id)){if(result.expired)setToken('');throw new Error(result.error||'保存失败，请稍后重试。');}
      setSaved(result.id!);setPhone('');setContent('');setConsent(false);lastSubmission.current=null;setCarriedContext(null);
    }catch(failure){setError(failure instanceof Error&&failure.name!=='AbortError'?failure.message:'提交超时，内容已保留，请重试。');}
    finally{clearTimeout(timer);setSubmitting(false);}
  };
  const changeOpen=(value:boolean)=>{if(submitting)return;if(!value){setSaved(null);setCarriedContext(null);}onOpenChange(value);};
  return <>
    <div className="site-feedback-footer"><button onClick={()=>onOpenChange(true)}><MessageSquareText size={15}/>反馈建议</button><span aria-hidden>·</span><button onClick={()=>setPrivacy(true)}>隐私说明</button></div>
    <Dialog open={open} onOpenChange={(value,details)=>{details.event.stopPropagation();changeOpen(value);}}><DialogContent className="site-feedback-dialog">
      <DialogHeader><DialogTitle>反馈与建议</DialogTitle><DialogDescription>指出史料错误、补充人物内容，或告诉我们遇到的问题。</DialogDescription></DialogHeader>
      <div className="feedback-form-scroll">
        {saved ? <div className="feedback-success"><CheckCircle2 size={42}/><h3>反馈已收到</h3><p>编号 #{saved}，感谢你帮助完善这张职官图。</p><button className="feedback-primary" onClick={()=>changeOpen(false)}>完成</button></div> : <>
          <p className="feedback-context">当前位置：{carriedContext?.context||context} · {carriedContext?.year||year} 年</p>
          {loading&&<output className="feedback-loading"><LoaderCircle size={18}/>正在打开反馈表单…</output>}
          {secureUrl ? <div className="feedback-secure"><ShieldCheck size={28}/><h3>通过安全连接提交</h3><p>反馈包含手机号，请切换到 HTTPS 后填写。</p><a className="feedback-primary" href={secureUrl}>打开安全反馈页面</a></div> : !token ? <div>{error&&<p className="feedback-error" role="alert">{error}</p>}{!loading&&<button type="button" className="feedback-retry" onClick={()=>setAttempt(value=>value+1)}>重新连接</button>}</div> : <form onSubmit={submit}>
            <label>反馈类型<select value={category} onChange={event=>setCategory(event.target.value)} disabled={submitting}>{['纠正错误','补充内容','功能问题','其他建议'].map(value=><option key={value}>{value}</option>)}</select></label>
            <label>手机号<input type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={phone} onChange={event=>setPhone(event.target.value)} placeholder="用于必要时就本条反馈联系你" required disabled={submitting}/></label>
            <label>反馈内容<textarea rows={6} maxLength={3000} value={content} onChange={event=>setContent(event.target.value)} placeholder="例如：哪一年、哪个人物或官职有误；如有资料出处，也请一并提供。" required disabled={submitting}/><small>{Array.from(content).length} / 3000</small></label>
            <div className="feedback-trap" aria-hidden="true"><label>网站<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event=>setWebsite(event.target.value)}/></label></div>
            <label className="feedback-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} required disabled={submitting}/><span>同意管理员查看手机号，并就这条反馈联系我。手机号不会公开展示。</span></label>
            {error&&<p className="feedback-error" role="alert">{error}</p>}
            <button className="feedback-primary" disabled={!token||loading||submitting}>{submitting?<><LoaderCircle size={18}/>正在提交…</>:'提交反馈'}</button>
          </form>}
        </>}
      </div>
    </DialogContent></Dialog>
    <Dialog open={privacy} onOpenChange={(value,details)=>{details.event.stopPropagation();setPrivacy(value);}}><DialogContent className="site-feedback-dialog"><DialogHeader><DialogTitle>隐私说明</DialogTitle><DialogDescription>访问统计与反馈信息的用途。</DialogDescription></DialogHeader><div className="feedback-form-scroll feedback-privacy"><h3>访问统计</h3><p>站点记录访问时间、来源 IP、IP 归属地、设备与浏览器、访问入口及来源网站域名，用于了解网站使用情况。不会读取 GPS 定位，来源 IP 也不等于真实住址。</p><p>省份通过服务器本地 IP 数据库估算，不为定位向外部接口逐次发送访客 IP。详细统计从功能上线后开始，不补造此前的访问明细。</p><h3>反馈信息</h3><p>手机号、反馈内容及提交时的页面和年份保存在本站数据库，仅管理员登录后可查看，用于核实和处理反馈，不在前台公开。提交表单不验证手机号归属，不会自动发送短信。</p><p>如需更正或删除已提交的反馈，可再次提交反馈并注明原编号，管理员核实后处理。</p></div></DialogContent></Dialog>
  </>;
}
