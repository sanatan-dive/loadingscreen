"""Cutscene spike pipeline: photo -> 3 verified face swaps -> 15s GTA-style cut."""
import base64, json, os, sys, time, urllib.request, io, subprocess
import cv2, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from identity import embed, cosine, detect, SAME

KEY = os.environ["OPENROUTER_API_KEY"]
MODEL_FAST = "google/gemini-2.5-flash-image"
MODEL_STRONG = "google/gemini-3-pro-image"

PROMPT = ("You are performing a FACE REPLACEMENT edit.\n"
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
    with urllib.request.urlopen(req,timeout=300) as r: d=json.load(r)
    if "error" in d: return None,0
    imgs=d["choices"][0]["message"].get("images") or []
    if not imgs: return None,0
    return base64.b64decode(imgs[0]["image_url"]["url"].split(",",1)[1]), d.get("usage",{}).get("cost",0)

def head_box(bgr, px=1.5, up=1.5, dn=1.7):
    fs=detect(bgr)
    if not fs: return None
    x,y,w,h=[float(v) for v in fs[0][:4]]; cx,cy=x+w/2,y+h/2
    H,W=bgr.shape[:2]
    return (max(0,int(cx-w*px)), max(0,int(cy-h*up)), min(W,int(cx+w*px)), min(H,int(cy+h*dn)))

def align(new, crop):
    fc,fn = detect(crop), detect(new)
    ch,cw = crop.shape[:2]
    if not fc or not fn:
        return cv2.resize(new,(cw,ch),interpolation=cv2.INTER_LANCZOS4)
    xc,yc,wc,hc=[float(v) for v in fc[0][:4]]; xn,yn,wn,hn=[float(v) for v in fn[0][:4]]
    s=((wc/wn)+(hc/hn))/2
    M=np.float32([[s,0,(xc+wc/2)-s*(xn+wn/2)],[0,s,(yc+hc/2)-s*(yn+hn/2)]])
    return cv2.warpAffine(new,M,(cw,ch),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_REPLICATE)

def mask(w,h,inset=0.05,blur=0.18):
    m=np.zeros((h,w),np.float32)
    cv2.ellipse(m,(w//2,int(h*0.46)),(int(w*(0.5-inset)),int(h*(0.5-inset))),0,0,360,1.0,-1)
    k=int(max(w,h)*blur)|1
    return cv2.GaussianBlur(m,(k,k),0)[...,None]

def swap_one(frame_path, face_path, out_path, user_emb, max_tries=3):
    bgr=cv2.imread(frame_path); box=head_box(bgr)
    if not box: return None, 0, "no face in template frame"
    X0,Y0,X1,Y1=box; crop=bgr[Y0:Y1,X0:X1]
    crop_png=cv2.imencode('.png',crop)[1].tobytes(); face_png=open(face_path,'rb').read()
    orig_emb=embed(bgr); spent=0.0
    for t in range(1,max_tries+1):
        model = MODEL_FAST if t<max_tries else MODEL_STRONG
        raw,cost=call(crop_png,face_png,model); spent+=cost
        if raw is None: continue
        new=cv2.cvtColor(np.array(Image.open(io.BytesIO(raw)).convert("RGB")),cv2.COLOR_RGB2BGR)
        en=embed(new); cu,co=cosine(en,user_emb),cosine(en,orig_emb)
        ok = cu>=SAME and cu>co
        print(f"    try{t} {model.split('/')[-1]:22s} vsUSER={cu:.3f} vsORIG={co:.3f} ${cost:.4f} {'PASS' if ok else 'reject'}")
        if ok:
            a=align(new,crop); m=mask(crop.shape[1],crop.shape[0])
            o=bgr.copy(); o[Y0:Y1,X0:X1]=(a*m+crop*(1-m)).astype(np.uint8)
            cv2.imwrite(out_path,o); return out_path, spent, None
    return None, spent, "identity gate failed after retries"

def render(shots, audio, out, D=5.667, X=1.0):
    PAN="crop=960:720:x='72-8.7*t':y=36"
    ins=[]; 
    for s in shots: ins += ["-i", s]
    ins += ["-i", audio]
    fc=""
    for i in range(3):
        fc+=f"[{i}:v]scale=1056:792:flags=lanczos,loop=loop=-1:size=1:start=0,fps=24,{PAN},setsar=1,trim=duration={D}[v{i}];"
    fc+=f"[v0][v1]xfade=transition=fade:duration={X}:offset={D-X}[x1];"
    fc+=f"[x1][v2]xfade=transition=fade:duration={X}:offset={2*D-2*X}[vout]"
    cmd=["ffmpeg","-v","error","-y"]+ins+["-filter_complex",fc,"-map","[vout]","-map","3:a","-t","15",
         "-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-r","24",
         "-c:a","aac","-b:a","192k","-movflags","+faststart",out]
    subprocess.run(cmd,check=True); return out

if __name__=="__main__":
    face, tmpl_dir, audio, out = sys.argv[1:5]
    t0=time.time()
    user_emb=embed(cv2.imread(face))
    if user_emb is None: sys.exit("no face found in uploaded photo")
    frames=[f"{tmpl_dir}/shot_3.0.png",f"{tmpl_dir}/shot_10.0.png",f"{tmpl_dir}/shot_16.5.png"]
    outs=[]; total=0.0
    for i,f in enumerate(frames,1):
        print(f"  shot {i}:")
        o,c,err=swap_one(f,face,f"/tmp/cs_shot{i}.png",user_emb); total+=c
        if err: sys.exit(f"  shot {i} FAILED: {err}")
        outs.append(o)
    render(outs,audio,out)
    print(f"\n  rendered {out}   api ${total:.4f}   wall {time.time()-t0:.1f}s")
