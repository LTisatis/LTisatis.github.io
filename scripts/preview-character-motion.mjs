// Local-only production preview plus an isolated puppet inspection page.
import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
const root=process.cwd();
const port=Number(process.env.PORT || 4322);
const special={
  "/__characters/":"scripts/character-motion-preview.html",
  "/__characters/v1/":"scripts/character-motion-preview-v1.html",
  "/__characters/preview.js":".artifacts/character-motion-v2/preview.js",
  "/__characters/rigs.json":"src/data/character-rigs.json",
  "/__characters/motion.css":"src/styles/character-motion.css",
};
const types={".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".webp":"image/webp",".jpg":"image/jpeg",".mp4":"video/mp4",".m4a":"audio/mp4",".woff2":"font/woff2"};
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,"http://localhost");
    const pathname=decodeURIComponent(url.pathname);
    const base=path.resolve(root,"dist");
    let file=special[pathname] ? path.resolve(root,special[pathname]) : path.resolve(base,`.${pathname}`);
    if(!special[pathname] && file!==base && !file.startsWith(base+path.sep)) {res.writeHead(403).end();return;}
    // The lab can inspect fresh assets before building the site.
    if(/^\/media\/characters(?:-v2)?\/[a-zA-Z0-9_.-]+$/.test(pathname)) file=path.resolve(root,"public",`.${pathname}`);
    if((await stat(file)).isDirectory()) file=path.join(file,"index.html");
    const data=await readFile(file);
    res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});
    res.end(data);
  } catch {res.writeHead(404).end("Not found");}
}).listen(port,"127.0.0.1",()=>console.log(`Blog: http://127.0.0.1:${port}/\nCharacter lab: http://127.0.0.1:${port}/__characters/`));
