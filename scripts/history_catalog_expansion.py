"""Expand sourced office types and expose provisional evidence without inventing dates."""
import hashlib
import json
import re
from collections import defaultdict

from history_model import INSTITUTIONS


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def key_for(name):
    if name=='市舶提举司': name='市舶司'
    return ({'皇帝':'emperor'}.get(name) or INSTITUTIONS.get(name)
            or 'institution-' + hashlib.sha1(name.encode('utf-8')).hexdigest()[:12])


def normalize(value):
    return re.sub(r'[（(].*?[）)]|\s|清吏', '', value or '')


def load_catalog(offices, research):
    gaps = read(research / 'office-gaps-20260907.json')
    ministries = read(research / 'ministry-office-gaps-20260907.json')
    compounds = read(research / 'compound-office-gaps-20260907.json')
    sources = {}
    for bundle in (gaps, ministries, compounds):
        values = bundle['sources']
        sources.update({s['id']:s for s in values} if isinstance(values,list) else values)
    added = []
    def add(identifier, institution, title, rank, department, note, evidence, sid, **extra):
        src = sources[sid]
        url = src.get('url') or src.get('source_url')
        assert url, sid
        row = {'record_id':identifier,'institution':institution,'title':title,'rank':rank,
               'headcount':None,'department':department,'duty_notes':note,
               'sources':[{'sheet':src.get('title') or src.get('source_title') or '原典补录','row':0,'range':institution,'region':'职制'}],
               'uncertainty_flags':[], 'rank_review':{'record_id':identifier,'original_rank':None,
                   'verified_rank':rank,'status':'qualified','source_url':url,'evidence':evidence,'note':note},
               'catalog_source_ids':['catalog-' + sid], **extra}
        added.append(row)
    for row in ministries['new_offices']:
        ev = row['evidence']
        add(row['record_id'],row['institution'],row['title'],row['rank'],row['department'],
            row['period']['note'] + ' 定员见原典，未作各年实有人数。',ev['original_excerpt'],ev['source_id'],
            catalog_period=row['period'],catalog_kind='branch_office',branch_id=row['branch_id'])
    for row in gaps['candidates']:
        add(row['candidate_id'],row['institution'],row['title'],row['rank']['display'],row['institution'],
            row['duties']+' '+' '.join(str(row['period'][k]) for k in ('note','boundary','later_note') if row['period'].get(k)),row['source_quote'],row['source_ids'][0],
            catalog_kind=row['entry_kind'],catalog_period=row['period'],historical_only=row['entry_kind']=='historical_formal_office')
    for group in compounds['explicit_compound_groups'] + compounds['semantic_conflation_groups']:
        for row in group['parts']:
            original = next(o for o in offices if o['record_id']==group['existing_record_id'])
            evidence = row['evidence']
            add(row['record_id'],row.get('institution') or original['institution'],row['title'],row['rank'] or '身份或爵位，不对应文武官品',
                row.get('institution') or original['institution'],row.get('period_note') or row.get('jurisdiction_scope') or '身份与本官、加衔分别查阅。',
                '；'.join(evidence) if isinstance(evidence,list) else evidence,row['source_ids'][0],
                catalog_kind=row['role_kind'],aggregate_source_id=group['existing_record_id'])
    assert len(added)==112
    existing = {o['record_id'] for o in offices}
    assert not existing & {o['record_id'] for o in added}
    offices.extend(added)
    # The twelve directorates were collected under one source heading, not one
    # interchangeable workplace. Preserve that heading in the source metadata.
    for office in offices:
        if office['record_id'] in {'official-0301','official-0302'}:
            office['catalog_source_institution']=office['institution']
            office['institution']='衍圣公与四氏教授司'
            office['catalog_note']='按《明史》衍圣公条编组；底稿合并在国子监表头下，不表示隶属国子监。'
        if office['record_id'] in {'official-0417','official-0418','official-0419'}:
            office['catalog_source_institution']=office['institution']
            office['institution']='市舶司'
            office['catalog_note']='底稿误接盐课机构合并表头；据本条原典与部门名称归入市舶提举司。'
        if office['institution']=='十二监':
            match = re.match(r'^(.+?监)',office['title'])
            if match:
                office['catalog_source_institution']='十二监'
                office['institution']=match[1]
                office['department']=match[1]
        office['institution_id']=key_for(office['institution'])
        office.setdefault('catalog_aliases',[])
    by_id={o['record_id']:o for o in offices}
    by_id['official-0524']['catalog_aliases']=['提督东厂','东厂提督','提督东厂太监']
    by_id['official-0152']['department']='刑部福建清吏司'
    by_id['official-0152']['duty_notes']='万历中减主事一员，未废福建司主事职；减员确年另考。'
    for row in ministries['retained_ambiguous_records']:
        office=by_id[row['record_id']]
        office['catalog_note']='原记录未明确到单个清吏司；有关人物先在本部查阅，分司待核。'
        office['unassigned_branch']=True
    return {'sources':sources,'gaps':gaps,'ministries':ministries,'compounds':compounds,'added':added}


def link_catalog_evidence(history, offices, bundle):
    catalog={o['record_id']:o for o in offices}
    quarantine={r['tenure_id'] for r in bundle['compounds']['person_link_quarantine']}
    local=defaultdict(set)
    bare_global=defaultdict(set)
    # Existing catalog links already have a reviewed pipeline. Do not broaden
    # that pipeline just because new types have been added.
    for office in bundle['added']:
        identifier=office['record_id']; name=normalize(office['title']); institution=normalize(office['institution'])
        department=normalize(office.get('department') or office['institution'])
        for alias in {name, institution+name, department+name, *[normalize(n) for n in office.get('catalog_aliases',[])]}:
            local[(office['institution_id'],alias)].add(identifier)
        if office.get('aggregate_source_id') in {'official-0001','official-0002','official-0003','official-0004','official-0005'}:
            bare_global[name].add(identifier)
    changes=[]
    excluded_basis={'same_person_overlapping_external_assignment_requires_duty_review',
        'manual_cabinet_overlap_ministry_duty_not_inferred','cross_dynasty_office_code_requires_institution_review'}
    honor_roles={'honorary_title','posthumous_or_honorary'}
    for row in history['tenures']:
        if row.get('timeline_scope') not in (None,'ming') or not row.get('source_ids'):
            continue
        if row.get('correction_reason') or row.get('membership_basis') in excluded_basis or row['id'] in quarantine:
            continue
        old_ids=list(row.get('office_ids',[])); old_members=list(row.get('institution_ids',[]))
        title=normalize(row.get('office_title')); institution=row.get('institution') or ''
        role=row.get('record_role'); matches=set()
        # Explicit honorary names are evidence categories, never service seats.
        if row['id'] in {'core-primary-20260907-04','core-primary-20260907-11',
                         'core-primary-20260907-12','core-primary-20260907-13'}:
            assert title in {'提督东厂','东厂提督','提督东厂太监'}
            matches={'official-0524'}
        elif role in honor_roles and row.get('record_kind')=='event':
            matches=bare_global.get(title,set())
        elif row.get('record_kind')!='event' and role in ('office_appointment','acting_office'):
            if re.search('南京|南都|南畿', institution+' '+(row.get('date_note') or '')):
                continue
            memberships=set(old_members)
            if not old_ids and memberships:
                matches=set().union(*(local.get((member,title),set()) for member in memberships))
                # Never restore institutional membership from the original CBDB
                # label alone: its office code can describe an external duty.
                matches={oid for oid in matches if catalog[oid]['institution_id'] in memberships}
        if not old_ids and len(matches)==1:
            oid=next(iter(matches)); office=catalog[oid]
            # Clearly dated former offices may be indexed as historical evidence,
            # but a conflicting year must not bind a later office template.
            period=office.get('catalog_period',{}); end=period.get('end_year')
            start=period.get('start_year'); years=[row[k] for k in ('start_year','attested_year','end_year') if row.get(k) is not None]
            if any((end is not None and y>end) or (start is not None and y<start) for y in years):
                continue
            row['office_ids']=[oid]
            if role not in honor_roles:
                row['institution_ids']=sorted(set(row.get('institution_ids',[]))|{office['institution_id']})
            row['catalog_link_basis']='sourced_exact_title_or_institution_pending_record_review'
        if old_ids!=row.get('office_ids',[]) or old_members!=row.get('institution_ids',[]):
            changes.append({'id':row['id'],'old_office_ids':old_ids,'office_ids':row.get('office_ids',[]),
                            'old_institution_ids':old_members,'institution_ids':row.get('institution_ids',[])})
    existing_sources={s['id'] for s in history['sources']}
    for sid,source in bundle['sources'].items():
        identifier='catalog-'+sid
        if identifier not in existing_sources:
            history['sources'].append({'id':identifier,'title':source.get('title') or source.get('source_title') or sid,
                'url':source.get('url') or source.get('source_url'),'source_type':'primary'})
    history['meta']['catalog_expansion_20260907']={'added_office_types':112,'catalog_count':len(offices),
        'linked_or_indexed_records':len(changes),'policy':'有来源的待核资料先展示；无确年者不推入指定年度，赠衔不冒充实任。'}
    return changes


def complete_catalog_datasets(history, offices, datasets, bundle):
    by_branch={r['branch_id']:r for r in bundle['ministries']['branch_office_matrix']}
    for ministry in datasets['ming-ministry-branches']['ministries']:
        for branch in ministry['branches']:
            matrix=by_branch.get(branch['id'])
            if matrix:
                branch['record_ids']=matrix['proposed_record_ids']
                branch['shared_record_ids']=[]
                branch['unmapped_roles']=[]
        retained=[r['record_id'] for r in bundle['ministries']['retained_ambiguous_records'] if r['institution']==ministry['name']]
        if retained:
            ministry['branches'].append({'id':ministry['ministry_id']+'-unassigned','name':'未定分司职官',
                'kind':'evidence_group','record_ids':retained,'shared_record_ids':[],
                'note':'分司待核','display_note':'来源未具体到某一司，先按本部展示；查明分司后再对应。',
                'source_url':ministry['source_url'],'evidence':'官职名称见本部定制；个人分司不由官名猜定。','default_visible':True})
    # Add the new early offices to their existing organizational groups without
    # drawing a rank ladder or pretending they existed throughout the dynasty.
    for hierarchy in datasets['ming-central-hierarchy']['institutions']:
        related=[o for o in bundle['added'] if o['institution'] in ('翰林院','中书省')
                 and key_for(o['institution']) in (hierarchy['institution_id'],
                     {'zhongshu-province':'central-secretariat'}.get(hierarchy['institution_id']))]
        if related:
            hierarchy['groups'].append({'id':hierarchy['institution_id']+'-early-supplement',
                'name':'早期职官沿革','parent_id':hierarchy['institution_id'],'kind':'historical_group',
                'relation':'same_institution_group','record_ids':[o['record_id'] for o in related],
                'display_note':'早期制度资料，各职设置与裁革年代分别查看；不表示本年仍置。',
                'source_url':related[0]['rank_review']['source_url'],'evidence':'各条目附具体原典与沿革。'})
    # Reusable compact person references; full records stay in existing person
    # shards. Year switching never downloads this all-era lookup index.
    office_index=defaultdict(lambda:defaultdict(set)); institution_index=defaultdict(lambda:defaultdict(set))
    lookup=defaultdict(set)
    for office in offices:
        name=normalize(office['title'])
        for title in {name, normalize(office['institution'])+name,
                      normalize(office.get('department') or office['institution'])+name,
                      *[normalize(n) for n in office.get('catalog_aliases',[])]}:
            lookup[(office['institution'],title)].add(office['record_id'])
    catalog={o['record_id']:o for o in offices}
    quarantine={r['tenure_id'] for r in bundle['compounds']['person_link_quarantine']}
    for row in history['tenures']:
        if not row.get('source_ids') or row.get('timeline_scope') not in (None,'ming'):
            continue
        bucket='undated' if all(row.get(k) is None for k in ('start_year','end_year','attested_year')) else 'dated'
        for oid in row.get('office_ids',[]): office_index[oid][bucket].add(row['person_id'])
        for iid in row.get('institution_ids',[]): institution_index[iid][bucket].add(row['person_id'])
        # Sourced but unconfirmed workplace matches are discoverable as related
        # evidence. They NEVER alter the appointment or yearly membership.
        if row.get('office_ids') or row['id'] in quarantine or row.get('correction_reason'):
            continue
        institution=row.get('institution') or ''
        note=institution+' '+(row.get('date_note') or '')
        if re.search('南京|南都|南畿', note):
            continue
        if row.get('membership_basis')=='cross_dynasty_office_code_requires_institution_review':
            continue
        years=[row[k] for k in ('start_year','attested_year','end_year') if row.get(k) is not None]
        if institution=='中书省' and (not years or any(y>=1380 for y in years)):
            continue
        matches=lookup.get((institution,normalize(row.get('office_title'))),set())
        if len(matches)!=1:
            continue
        oid=next(iter(matches)); office=catalog[oid]; period=office.get('catalog_period',{})
        if any((period.get('start_year') is not None and y<period['start_year'])
               or (period.get('end_year') is not None and y>period['end_year']) for y in years):
            continue
        office_index[oid]['related'].add(row['person_id'])
        institution_index[office['institution_id']]['related'].add(row['person_id'])
    serialize=lambda value:{key:{kind:sorted(ids) for kind,ids in buckets.items()} for key,buckets in value.items()}
    datasets['office-evidence-index']={'offices':serialize(office_index),'institutions':serialize(institution_index),
        'note':'先收录有来源的待核人物；未系年名单不表示所选年份在职。'}
    datasets['office-catalog']['policy']='有非虚构来源的官职、职掌与待核记录先列出，品级或年代未明的保留说明。'
