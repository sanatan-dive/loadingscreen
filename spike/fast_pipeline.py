"""Parallel pipeline: 3 swaps concurrently + render. Timed."""
import os, sys, time, cv2, numpy as np, subprocess
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from identity import embed, cosine, detect, SAME
from bench import call, head_crop
from PIL import Image
import io

LADDER = ["google/gemini-3.1-flash-lite-image",   # fast+cheap+accurate
          "google/gemini-3.1-flash-image",        # fallback
          "google/gemini-3-pro-image"]            # last resort

def head_box(bgr, px=1.5, up=1.5, dn=1.7):
    fs=detect(bgr); x,y,w,h=[float(v) for v in fs[0][:4]]; cx,cy=x+w/2,y+h/2
    H,W=bgr.shape[:2]
    return (max(0,int(cx-w*px)),max(0,int(cy-h*up)),min(W,int(cx+w*px)),min(H,int(cy+h*dn)))
def align(new,crop):
    fc,fn=detect(crop),detect(new); ch,cw=crop.shape[:2]
    if not fc or not fn: return cv2.resize(new,(cw,ch),interpolation=cv2.INTER_LANCZOS4)
    xc,yc,wc,hc=[float(v) for v in fc[0][:4]]; xn,yn,wn,hn=[float(v) for v in fn[0][:4]]
    s=((wc/wn)+(hc/hn))/2
    M=np.float32([[s,0,(xc+wc/2)-s*(xn+wn/2)],[0,s,(yc+hc/2)-s*(yn+hn/2)]])
    return cv2.warpAffine(new,M,(cw,ch),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_REPLICATE)
def mask(w,h,inset=0.05,blur=0.18):
    m=np.zeros((h,w),np.float32)
    cv2.ellipse(m,(w//2,int(h*0.46)),(int(w*(0.5-inset)),int(h*(0.5-inset))),0,0,360,1.0,-1)
    k=int(max(w,h)*blur)|1
    return cv2.GaussianBlur(m,(k,k),0)[...,None]

def swap(idx, frame_path, face_png, user_emb, out):
    bgr=cv2.imread(frame_path); X0,Y0,X1,Y1=head_box(bgr); crop=bgr[Y0:Y1,X0:X1]
    crop_png=cv2.imencode('.png',crop)[1].tobytes(); orig=embed(bgr); spent=0.0
    for model in LADDER:
        raw,el,cost,err=call(crop_png,face_png,model); spent+=cost
        if raw is None: print(f"   shot{idx} {model.split('/')[-1]}: {err}"); continue
        new=cv2.cvtColor(np.array(Image.open(io.BytesIO(raw)).convert("RGB")),cv2.COLOR_RGB2BGR)
        en=embed(new); cu,co=cosine(en,user_emb),cosine(en,orig)
        ok=cu>=SAME and cu>co
        print(f"   shot{idx} {model.split('/')[-1]:30s} {el:5.1f}s ${cost:.4f} vsUSER={cu:.3f} {'PASS' if ok else 'reject'}")
        if ok:
            a=align(new,crop); m=mask(crop.shape[1],crop.shape[0])
            o=bgr.copy(); o[Y0:Y1,X0:X1]=(a*m+crop*(1-m)).astype(np.uint8)
            cv2.imwrite(out,o); return out,spent
    return None,spent

def render(shots,audio,out,D=5.667,X=1.0):
    PAN="crop=960:720:x='72-8.7*t':y=36"
    ins=[]
    for s in shots: ins+=["-i",s]
    ins+=["-i",audio]
    fc="".join(f"[{i}:v]scale=1056:792:flags=lanczos,loop=loop=-1:size=1:start=0,fps=24,{PAN},setsar=1,trim=duration={D}[v{i}];" for i in range(3))
    fc+=f"[v0][v1]xfade=transition=fade:duration={X}:offset={D-X}[x1];[x1][v2]xfade=transition=fade:duration={X}:offset={2*D-2*X}[vout]"
    subprocess.run(["ffmpeg","-v","error","-y"]+ins+["-filter_complex",fc,"-map","[vout]","-map","3:a","-t","15",
      "-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","-r","24",
      "-c:a","aac","-b:a","192k","-movflags","+faststart",out],check=True)

if __name__=="__main__":
    face,tmpl,audio,out=sys.argv[1:5]
    T0=time.time()
    user=embed(cv2.imread(face)); face_png=open(face,'rb').read()
    frames=[f"{tmpl}/shot_3.0.png",f"{tmpl}/shot_10.0.png",f"{tmpl}/shot_16.5.png"]
    t_swap=time.time()
    with ThreadPoolExecutor(max_workers=3) as ex:
        res=list(ex.map(lambda a: swap(a[0],a[1],face_png,user,f"/tmp/fp{a[0]}.png"), enumerate(frames,1)))
    swap_s=time.time()-t_swap
    if any(r[0] is None for r in res): sys.exit("a shot failed the identity gate")
    t_r=time.time(); render([r[0] for r in res],audio,out); render_s=time.time()-t_r
    print(f"\n   swaps (parallel): {swap_s:5.1f}s")
    print(f"   ffmpeg render:    {render_s:5.1f}s")
    print(f"   TOTAL:            {time.time()-T0:5.1f}s   api ${sum(r[1] for r in res):.4f}")
