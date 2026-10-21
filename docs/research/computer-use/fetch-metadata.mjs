import { writeFile } from 'node:fs/promises';
const repos = ['trycua/cua','bytedance/UI-TARS-desktop','simular-ai/Agent-S','nut-tree/nut.js','asweigart/pyautogui','screenpipe/screenpipe'];
const urls = repos.flatMap(r => [`https://api.github.com/repos/${r}`,`https://api.github.com/repos/${r}/releases?per_page=4`,`https://api.github.com/repos/${r}/commits?per_page=1`]);
urls.push('https://pypi.org/pypi/PyAutoGUI/json','https://pypi.org/pypi/cua-driver/json','https://registry.npmjs.org/@trycua%2fcua-driver','https://registry.npmjs.org/@nut-tree%2fnut-js');
const results = await Promise.all(urls.map(async url => {
  const at = new Date().toISOString();
  try { const r=await fetch(url,{headers:{'User-Agent':'alpha-AOS-research','Accept':'application/json'},signal:AbortSignal.timeout(25000)}); return {url,at,status:r.status,body:await r.json()}; }
  catch(e){return {url,at,error:String(e)};}
}));
await writeFile(new URL('./metadata-live.json',import.meta.url),JSON.stringify({capturedAt:new Date().toISOString(),results},null,2)+'\n');
for (const r of results) {
  const b=r.body;
  if(!b){console.log(JSON.stringify({url:r.url,error:r.error}));continue;}
  let summary;
  if(r.url.includes('/releases?')) summary=b.map(x=>({tag:x.tag_name,published:x.published_at,prerelease:x.prerelease,assets:x.assets?.map(a=>({name:a.name,url:a.browser_download_url,digest:a.digest,size:a.size}))}));
  else if(r.url.includes('/commits?')) summary=b.map(x=>({sha:x.sha,date:x.commit?.committer?.date,message:x.commit?.message?.split('\n')[0]}));
  else if(r.url.includes('pypi.org')) summary={name:b.info?.name,version:b.info?.version,requiresPython:b.info?.requires_python,license:b.info?.license,projectUrls:b.info?.project_urls,files:b.urls?.map(x=>({filename:x.filename,sha256:x.digests?.sha256,uploaded:x.upload_time_iso_8601,url:x.url}))};
  else if(r.url.includes('registry.npmjs.org')){const v=b['dist-tags']?.latest;const p=b.versions?.[v];summary={name:b.name,version:v,published:b.time?.[v],license:p?.license,engines:p?.engines,dist:p?.dist,repository:p?.repository,scripts:p?.scripts};}
  else summary={repo:b.full_name,stars:b.stargazers_count,forks:b.forks_count,subscribers:b.subscribers_count,openIssues:b.open_issues_count,created:b.created_at,updated:b.updated_at,pushed:b.pushed_at,archived:b.archived,license:b.license?.spdx_id,defaultBranch:b.default_branch};
  console.log(JSON.stringify({url:r.url,status:r.status,summary}));
}
