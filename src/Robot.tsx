export function Robot({className='',working=false}:{className?:string;working?:boolean}){
 return <svg className={`robot ${working?'robot-working':''} ${className}`} viewBox="0 0 100 110" fill="none" aria-hidden="true">
  <ellipse cx="50" cy="103" rx="30" ry="5" fill="#07172c" opacity=".2"/>
  <path d="M50 17V9" stroke="white" strokeWidth="4" strokeLinecap="round"/><circle cx="50" cy="7" r="5" fill="white"/>
  <rect x="18" y="20" width="64" height="47" rx="19" fill="#fff" stroke="#d8dce2" strokeWidth="2"/>
  <rect x="25" y="29" width="50" height="28" rx="12" fill="#131820"/>
  <g className="robot-eyes"><rect x="36" y="37" width="5" height="10" rx="2.5" fill="white"/><rect x="59" y="37" width="5" height="10" rx="2.5" fill="white"/></g>
  <path d="M46 52Q50 55 54 52" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  <rect x="30" y="69" width="40" height="25" rx="10" fill="#fff"/>
  <circle cx="50" cy="80" r="5" stroke="#262a32" strokeWidth="2"/><circle cx="50" cy="80" r="1.5" fill="#262a32"/>
  <path className="robot-arm" d="M25 74 15 86M75 74 85 64" stroke="#fff" strokeWidth="9" strokeLinecap="round"/>
  <path d="M39 94V100M61 94V100" stroke="#f0f0f0" strokeWidth="8" strokeLinecap="round"/>
  <rect x="12" y="36" width="5" height="15" rx="2.5" fill="#e0e2e7"/><rect x="83" y="36" width="5" height="15" rx="2.5" fill="#e0e2e7"/>
 </svg>;
}
