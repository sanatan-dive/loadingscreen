import base64, json, os, sys, time, urllib.request, io, cv2, numpy as np
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from identity import embed, cosine, detect, SAME
from PIL import Image
KEY=os.environ["OPENROUTER_API_KEY"]
PROMPT=("You are performing a FACE REPLACEMENT edit.\n"
 "IMAGE A (first) = the scene to edit. IMAGE B (second) = the identity to insert.\n"
 "Output IMAGE A with the person's face, hair and neck REPLACED by the person from IMAGE B.\n"
 "The output MUST show the man from IMAGE B - his facial structure, his skin tone, his hair, his beard. "
 "It must NOT show the original man from IMAGE A. This is the entire point of the edit.\n"
 "Preserve from IMAGE A only: the clothing, the background, the head angle, the lighting direction and the framing.\n"
 "Photorealistic, matching grain. No text.")
def call(crop_png, face_png, model):
    body={"model":model,"modalities":["image","text"],"messages":[{"role":"user","content":[
      {"type":"text","text":PROMPT},
      {"type":"image_url","image_url":{"url":"data:image/png;base64,"+base64.b64encode(crop_png).decode()}},
      {"type":"image_url","image_url":{"url":"data:image/png;base64,"+base64.b64encode(face_png).decode()}}]}]}
    req=urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",data=json.dumps(body).encode(),
      headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    t0=time.time()
    try:
        with urllib.request.urlopen(req,timeout=300) as r: d=json.load(r)
    except Exception as e: return None, time.time()-t0, 0, str(e)[:80]
    el=time.time()-t0
    if "error" in d: return None, el, 0, str(d["error"])[:80]
    imgs=d["choices"][0]["message"].get("images") or []
    if not imgs: return None, el, 0, "no image"
    return base64.b64decode(imgs[0]["image_url"]["url"].split(",",1)[1]), el, d.get("usage",{}).get("cost",0), None
def head_crop(bgr,px=1.5,up=1.5,dn=1.7):
    fs=detect(bgr); x,y,w,h=[float(v) for v in fs[0][:4]]; cx,cy=x+w/2,y+h/2
    H,W=bgr.shape[:2]
    return bgr[max(0,int(cy-h*up)):min(H,int(cy+h*dn)), max(0,int(cx-w*px)):min(W,int(cx+w*px))]
if __name__=="__main__":
    SP,IMG=sys.argv[1],sys.argv[2]
    bgr=cv2.imread(f"{SP}/shots/shot_3.0.png"); crop=head_crop(bgr)
    crop_png=cv2.imencode('.png',crop)[1].tobytes(); face_png=open(f"{IMG}/7.png",'rb').read()
    user=embed(cv2.imread(f"{IMG}/7.png")); orig=embed(bgr)
    models=["google/gemini-3-pro-image","google/gemini-3.1-flash-image","google/gemini-3.1-flash-lite-image","google/gemini-2.5-flash-image"]
    def one(m):
        raw,el,cost,err=call(crop_png,face_png,m)
        if raw is None: return (m,el,cost,float('nan'),float('nan'),err)
        new=cv2.cvtColor(np.array(Image.open(io.BytesIO(raw)).convert("RGB")),cv2.COLOR_RGB2BGR)
        cv2.imwrite(f"{SP}/bench_{m.split('/')[-1]}.png",new)
        en=embed(new)
        return (m,el,cost,cosine(en,user),cosine(en,orig),None)
    t0=time.time()
    with ThreadPoolExecutor(max_workers=4) as ex: rows=list(ex.map(one,models))
    print(f"{'model':<38}{'sec':>7}{'cost':>9}{'vsUSER':>9}{'vsORIG':>9}  verdict")
    print("-"*84)
    for m,el,cost,cu,co,err in rows:
        v = err if err else ("PASS" if (cu>=SAME and cu>co) else "fail identity")
        print(f"{m.split('/')[-1]:<38}{el:7.1f}{cost:9.4f}{cu:9.3f}{co:9.3f}  {v}")
    print(f"\nall 4 in parallel: {time.time()-t0:.1f}s wall")
