import { useId } from 'react';

export type CourtFigureProps = {
  isMilitary: boolean;
  className?: string;
};

/**
 * Decorative, rear-facing court figure. Both soles end at y=298.
 * The geometric back ornament indicates no historical rank or named insignia.
 */
export function CourtFigure({ isMilitary, className }: CourtFigureProps) {
  const id = useId().replace(/:/g, '');
  const ref = (name: string) => `url(#${id}-${name})`;
  const robe = isMilitary
    ? ['#8c4337', '#6a2928', '#431e20']
    : ['#b95d42', '#903b30', '#592323'];

  return (
    <svg
      viewBox="0 0 120 300"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-robe`} x1="27" y1="80" x2="97" y2="253" gradientUnits="userSpaceOnUse">
          <stop stopColor={robe[0]} />
          <stop offset=".44" stopColor={robe[1]} />
          <stop offset="1" stopColor={robe[2]} />
        </linearGradient>
        <linearGradient id={`${id}-sleeve`} x1="0" y1="0" x2="1" y2=".5">
          <stop stopColor={robe[2]} />
          <stop offset=".48" stopColor={robe[1]} />
          <stop offset="1" stopColor={robe[0]} />
        </linearGradient>
        <linearGradient id={`${id}-hat`} x1="39" y1="10" x2="81" y2="51" gradientUnits="userSpaceOnUse">
          <stop stopColor="#48423a" />
          <stop offset=".46" stopColor="#282824" />
          <stop offset="1" stopColor="#141b1a" />
        </linearGradient>
        <linearGradient id={`${id}-boots`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#272923" />
          <stop offset=".72" stopColor="#131a18" />
          <stop offset="1" stopColor="#3a382c" />
        </linearGradient>
        <linearGradient id={`${id}-silk`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#dec28b" stopOpacity=".05" />
          <stop offset=".45" stopColor="#e7c18c" stopOpacity=".23" />
          <stop offset="1" stopColor="#e7c18c" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Heel-first boots: no forward-pointing toes in this rear view. */}
      <path d="M41 266 40 288Q35 292 34 295L35 298H54L55 286 55 266Z" fill={ref('boots')} />
      <path d="M65 266 65 286 66 298H85L86 295Q85 292 80 288L79 266Z" fill={ref('boots')} />
      <path d="M36 296H53M67 296H84" stroke="#c2af7e" strokeOpacity=".58" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M43 280 43 289M77 280 77 289" stroke="#807b5c" strokeOpacity=".35" strokeWidth="1.2" />

      {/* Robe silhouette is continuous; the small folds stay inside its contour. */}
      <path
        d={isMilitary
          ? 'M47 59Q35 62 27 72L23 116 32 171Q33 203 25 269Q38 280 60 281Q82 280 95 269Q87 203 88 171L97 116 93 72Q85 62 73 59Z'
          : 'M48 60Q37 62 29 72L25 115 34 167Q34 210 24 271Q41 281 60 282Q79 281 96 271Q86 210 86 167L95 115 91 72Q83 62 72 60Z'}
        fill={ref('robe')}
      />
      <path d="M30 73Q23 82 21 102L16 163Q17 184 27 191L39 182 38 147 41 96Z" fill={ref('sleeve')} />
      <path d="M90 73Q97 82 99 102L104 163Q103 184 93 191L81 182 82 147 79 96Z" fill={ref('robe')} />
      <path d="M19 167Q25 175 37 174L38 183 27 191Q20 187 18 179Z" fill="#341e1c" fillOpacity=".55" />
      <path d="M101 167Q95 175 83 174L82 183 93 191Q100 187 102 179Z" fill="#271b1c" fillOpacity=".64" />
      <path d="M29 79Q25 112 24 149M90 84Q95 116 95 149" fill="none" stroke="#df9d6c" strokeOpacity=".23" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M35 107Q31 138 34 160M86 106Q91 140 87 161" fill="none" stroke="#311c1c" strokeOpacity=".45" strokeWidth="2" />

      <path d="M45 165Q45 218 34 270L43 274Q51 218 52 169Z" fill={ref('silk')} />
      <path d="M69 168Q72 222 78 275L87 271Q76 216 77 165Z" fill="#211b1d" fillOpacity=".22" />
      <path d="M59 175 58 275M39 193Q39 235 30 264M82 193Q82 235 90 265" fill="none" stroke="#291c1b" strokeOpacity=".46" strokeWidth="1.5" />
      <path d="M54 188 50 268M66 188 71 270" fill="none" stroke="#cd8e62" strokeOpacity=".17" strokeWidth="1.2" />
      <path d="M27 270Q59 283 93 270" fill="none" stroke="#d19b64" strokeOpacity=".3" strokeWidth="1.3" />

      {/* A restrained decorative panel, deliberately without birds or beasts. */}
      <path d="M43 82H77V119H43Z" fill="#494131" fillOpacity=".78" stroke="#b49a66" strokeOpacity=".6" strokeWidth="1" />
      <path d="M47 86H73V115H47Z" fill="none" stroke="#b49a66" strokeOpacity=".35" strokeWidth=".8" />
      <path d="M60 90 69 100 60 110 51 100Z" fill="#ae9461" fillOpacity=".24" />
      <path d="M60 94 65 100 60 106 55 100ZM48 111 52 108M68 92 72 89" fill="none" stroke="#d5bc82" strokeOpacity=".58" strokeWidth="1" />
      <path d="M47 61Q60 69 73 61L77 70Q60 78 43 70Z" fill="#3c2923" />
      <path d="M46 65Q60 72 74 65" fill="none" stroke="#d9b885" strokeOpacity=".48" strokeWidth="1.3" />

      <path d="M35 151Q60 157 85 151L86 163Q60 169 34 163Z" fill="#2e2820" />
      <path d="M35 152Q60 158 85 152M35 162Q60 168 85 162" fill="none" stroke="#bca06a" strokeOpacity=".58" strokeWidth="1" />
      {[41, 51, 61, 71].map((x) => <rect key={x} x={x} y={x < 45 || x > 68 ? 155 : 157} width="7" height="5" rx="1" fill="#9c8053" fillOpacity={isMilitary ? '.76' : '.6'} />)}

      {/* Nape and back of the head, no facial features. */}
      <path d="M51 46 50 62Q60 67 70 62L69 46Z" fill="#947353" />
      <path d="M52 49 52 58Q61 62 68 56L69 48Z" fill="#5a4b36" fillOpacity=".65" />
      <path d="M44 27Q42 41 47 49Q60 58 73 49Q78 41 76 27Z" fill="#332e26" />
      <path d="M44 26 10 21Q6 22 7 29L43 35ZM76 26 110 21Q114 22 113 29L77 35Z" fill="#232a25" />
      <path d="M10 23 42 28M78 28 110 23" stroke="#b0a078" strokeOpacity=".25" strokeWidth=".8" />
      <path d="M43 38 42 23Q43 9 52 7Q60 4 68 7Q77 9 78 23L77 38Q60 45 43 38Z" fill={ref('hat')} />
      <path d="M44 36Q60 42 76 36L76 42Q60 48 44 42Z" fill="#171e1b" />
      <path d="M48 12Q58 6 67 10M46 21 46 32M59 10V35" fill="none" stroke="#b3a37e" strokeOpacity=".24" strokeWidth="1" strokeLinecap="round" />
      <path d="M44 40Q60 46 76 40" fill="none" stroke="#86785b" strokeOpacity=".48" strokeWidth=".9" />
    </svg>
  );
}
