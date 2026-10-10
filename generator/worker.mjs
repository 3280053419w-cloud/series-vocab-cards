import {generate,ServiceError} from './core.mjs';
const encoder = new TextEncoder();
const json = (data,status,headers) => new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin')||'',allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
    const headers={'Vary':'Origin','Cache-Control':'no-store'};
    if(!allowed.includes(origin))return json({error:'此网页未获准连接生成服务'},403,headers);
    headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Headers']='Authorization, Content-Type';
    headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!env.APP_TOKEN||env.APP_TOKEN.length<16)return json({error:'服务端尚未配置访问口令'},503,headers);
    if(request.headers.get('Authorization')!=='Bearer '+env.APP_TOKEN)return json({error:'访问口令不正确'},401,headers);
    const path=new URL(request.url).pathname;
    if(path==='/health'&&request.method==='GET')return json({ready:!!(env.AI_API_KEY&&env.AI_BASE_URL&&env.AI_MODEL),service:'series-vocab-generator/v1'},200,headers);
    if(path!=='/generate'||request.method!=='POST')return json({error:'接口不存在'},404,headers);
    if(!env.AI_API_KEY||!env.AI_BASE_URL||!env.AI_MODEL)return json({error:'请先在服务端配置 AI_API_KEY、AI_BASE_URL 和 AI_MODEL'},503,headers);
    if(env.RATE_LIMITER){const limit=await env.RATE_LIMITER.limit({key:'generation'});if(!limit.success)return json({error:'生成请求较多，请稍后重试'},429,headers);}
    if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'请求格式不正确'},400,headers);
    let input;
    try{
      const reader=request.body.getReader();let size=0,parts=[];
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>900000){await reader.cancel();return json({error:'字幕文件过大'},413,headers);}parts.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}input=JSON.parse(new TextDecoder().decode(bytes));
      globalThis.DeckFormat.input(input);
    }catch(err){return json({error:err.message||'请求格式不正确'},400,headers);}
    const controller=new AbortController();request.signal.addEventListener('abort',()=>controller.abort(),{once:true});
    const timer=setTimeout(()=>controller.abort(),480000);
    const stream=new ReadableStream({
      start(output){
        const send=data=>{if(!controller.signal.aborted)output.enqueue(encoder.encode(JSON.stringify(data)+'\n'));};
        (async()=>{
          try{const deck=await generate(input,env,message=>send({type:'progress',message}),env.FETCH||fetch,controller.signal);send({type:'result',payload:deck});}
          catch(err){if(!controller.signal.aborted)send({type:'error',message:err instanceof ServiceError?err.message:'生成失败，请稍后重试'});}
          finally{clearTimeout(timer);try{output.close();}catch{}}
        })();
      },
      cancel(){controller.abort();clearTimeout(timer);}
    });
    return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','X-Content-Type-Options':'nosniff'}});
  }
};
