export function Robot({className='',working=false}:{className?:string;working?:boolean}){
 return <svg className={`robot ${working?'robot-working':''} ${className}`} viewBox="4 1 92 106" fill="none" aria-hidden="true" data-charging={working?'true':'false'}>
  <ellipse cx="50" cy="103" rx="29" ry="4" fill="#000" opacity=".16"/>
  <g className="robot-charge-energy"><path d="M12 50Q8 29 28 16M88 50Q92 29 72 16" stroke="white" strokeWidth="1.5" strokeDasharray="3 6"/><path d="m15 30 5-8-1 6h5l-7 9 2-7M79 30l5-8-1 6h5l-7 9 2-7" fill="white"/></g>
  <g className="robot-body">
   <g className="robot-arm-left"><path d="M29 75 18 78 12 60" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/><circle cx="18" cy="78" r="3" fill="#b9bdc5"/><circle cx="12" cy="59" r="5" fill="#fff"/></g>
   <g className="robot-arm-right"><path d="M71 75 82 78 88 60" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/><circle cx="82" cy="78" r="3" fill="#b9bdc5"/><circle cx="88" cy="59" r="5" fill="#fff"/></g>
   <path d="M50 17V9" stroke="#fff" strokeWidth="4" strokeLinecap="round"/><circle cx="50" cy="7" r="5" fill="#fff"/>
   <rect x="18" y="20" width="64" height="47" rx="19" fill="#fff" stroke="#d8dce2" strokeWidth="2"/>
   <rect x="25" y="29" width="50" height="28" rx="12" fill="#131820"/>
   <g className="robot-lightning-eyes" fill="#fff"><path d="m40 33-8 12h6l-2 10 11-15h-7l3-7Z"/><path d="m62 33-8 12h6l-2 10 11-15h-7l3-7Z"/></g>
   <rect x="31" y="69" width="38" height="25" rx="10" fill="#fff"/>
   <rect x="42" y="73" width="16" height="16" rx="5" fill="#15191f"/>
   <path className="robot-charge-core" d="m51 74-6 8h5l-1 6 7-10h-5l2-4Z" fill="#fff"/>
   <path d="M39 94V100M61 94V100" stroke="#f0f0f0" strokeWidth="8" strokeLinecap="round"/>
   <rect x="12" y="36" width="5" height="15" rx="2.5" fill="#e0e2e7"/><rect x="83" y="36" width="5" height="15" rx="2.5" fill="#e0e2e7"/>
  </g>
 </svg>;
}
