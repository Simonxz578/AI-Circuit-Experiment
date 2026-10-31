/** Product copy for the default student view; solver diagnostics remain available in source data. */
export function studentText(text:string=''){
 if(text.includes('LED/二极管需填写正向压降'))return '请在右侧填写 LED 的导通电压，填写后就能看到电表读数。';
 if(text.includes('LED/二极管使用用户明确给定'))return 'LED 按你填写的导通电压近似计算，不代表完整的真实特性。';
 if(text.includes('电容按直流稳态开路'))return '当前显示稳定后的状态：电容不通过电流，不模拟刚接通时的充放电过程。';
 return text.replace(' 待填写或确认参数；不使用猜测值计算。',' 还未填写，补齐后即可查看读数。');
}
