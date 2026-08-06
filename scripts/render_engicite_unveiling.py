from __future__ import annotations

import math
import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "promotional"
OUT.mkdir(exist_ok=True)

W, H, FPS, DURATION = 1920, 1080, 24, 15
NAVY = (10, 26, 45)
BLUE = (16, 36, 62)
ORANGE = (232, 115, 63)
PALE = (244, 246, 248)
MUTED = (150, 164, 180)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "seguisb.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def ease(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def pulse(x: float) -> float:
    return math.sin(max(0, min(1, x)) * math.pi)


def text_layer(base: Image.Image, xy, text, fnt, fill, alpha=255, anchor="mm"):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text(xy, text, font=fnt, fill=(*fill, alpha), anchor=anchor)
    base.alpha_composite(layer)


def draw_web_icon(base: Image.Image, cx: int, cy: int, size: int, progress: float):
    """Exact motion version of the web app's navy square, copper rail and [C] glyph."""
    if progress <= 0:
        return
    p = ease(progress)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer, "RGBA")
    half = int(size * (0.43 + 0.07*p))
    box = (cx-half, cy-half, cx+half, cy+half)
    # Copper underlay wraps the navy tile at the left edge, matching the supplied mark.
    d.rounded_rectangle(box, radius=int(size*.18), fill=(*ORANGE, int(255*p)))
    navy_box = (box[0]+int(size*.035), box[1], box[2], box[3])
    d.rounded_rectangle(navy_box, radius=int(size*.18), fill=(*BLUE, int(255*p)), outline=(255,255,255,int(22*p)), width=2)
    # White citation brackets overlap the central C exactly as in the reference.
    glyph_y = cy-int(size*.015)
    glyph_font = font(int(size*.31), True)
    text_layer(layer, (cx, glyph_y), "C", glyph_font, PALE, int(255*p))
    bw, bh = int(size*.026), int(size*.25)
    left, right, top, bottom = cx-int(size*.18), cx+int(size*.18), glyph_y-bh//2, glyph_y+bh//2
    d.rectangle((left, top, left+bw, bottom), fill=(*PALE,int(255*p)))
    d.rectangle((left, top, left+int(size*.09), top+bw), fill=(*PALE,int(255*p)))
    d.rectangle((left, bottom-bw, left+int(size*.09), bottom), fill=(*PALE,int(255*p)))
    d.rectangle((right-bw, top, right, bottom), fill=(*PALE,int(255*p)))
    d.rectangle((right-int(size*.09), top, right, top+bw), fill=(*PALE,int(255*p)))
    d.rectangle((right-int(size*.09), bottom-bw, right, bottom), fill=(*PALE,int(255*p)))
    # Restrained glow behind the exact mark.
    glow = layer.filter(ImageFilter.GaussianBlur(int(size*.09)))
    glow.putalpha(glow.getchannel("A").point(lambda a: int(a*.22)))
    base.alpha_composite(glow)
    base.alpha_composite(layer)


def frame_at(t: float) -> Image.Image:
    xgrad = np.linspace(0, 1, W, dtype=np.float32)[None, :]
    ygrad = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    mix = .35*xgrad + .65*ygrad
    bg = np.empty((H, W, 3), dtype=np.uint8)
    for c, (a, b) in enumerate(zip(NAVY, BLUE)):
        bg[:, :, c] = (a + (b-a)*mix).astype(np.uint8)
    im = Image.fromarray(bg, "RGB").convert("RGBA")
    d = ImageDraw.Draw(im, "RGBA")

    grid_fade = 1 - ease((t-4.5)/2.8)
    grid_a = int(22 * ease((t-.5)/2) * grid_fade)
    if grid_a > 0:
        for xx in range(0, W, 80): d.line((xx, 0, xx, H), fill=(255,255,255,grid_a), width=1)
        for yy in range(0, H, 80): d.line((0, yy, W, yy), fill=(255,255,255,grid_a), width=1)
    d.arc((W//2-380, H//2-380, W//2+380, H//2+380), -35+t*7, 75+t*7, fill=(*ORANGE,45), width=2)
    d.arc((W//2-500, H//2-500, W//2+500, H//2+500), 150-t*5, 245-t*5, fill=(255,255,255,28), width=2)

    # 0–4s: the premise.
    intro = pulse(t/4.2)
    if intro > 0:
        text_layer(im, (W//2, 430), "EVERY NEW ERA", font(26, True), ORANGE, int(255*intro))
        text_layer(im, (W//2, 505), "begins with a question.", font(62), PALE, int(255*intro))
        d.line((W//2-110, 575, W//2+110, 575), fill=(*ORANGE,int(180*intro)), width=3)

    # 3.5–8s: the exact app icon is born and settles left for the horizontal lockup.
    icon_p = ease((t-3.4)/2.0)
    lockup_p = ease((t-6.4)/1.4)
    icon_x = int(W//2 + (655-W//2)*lockup_p)
    draw_web_icon(im, icon_x, H//2-35, 280, icon_p)

    # 6.5s onward: horizontal EngiCite lockup, matching the app.
    if lockup_p > 0:
        word_y = H//2-38
        word_font = font(124, True)
        text_layer(im, (825, word_y), "Engi", word_font, PALE, int(255*lockup_p), "lm")
        engi_width = ImageDraw.Draw(im).textlength("Engi", font=word_font)
        text_layer(im, (825+int(engi_width)-3, word_y), "Cite", word_font, ORANGE, int(255*lockup_p), "lm")

    # Brand promise beneath the horizontal mark.
    promise = ease((t-8.2)/1.2)
    if promise > 0:
        d.line((650, 705, 1270, 705), fill=(*ORANGE,int(150*promise)), width=2)
        text_layer(im, (W//2, 765), "KNOW THE ANSWER.  CITE THE PROOF.", font(26, True), PALE, int(255*promise))

    # Closing launch message.
    final = ease((t-11.0)/1.1)
    if final > 0:
        d.rounded_rectangle((730, 850, 1190, 914), radius=32, fill=(*ORANGE,int(240*final)))
        text_layer(im, (W//2, 881), "A NEW IDEA IS BORN", font(21, True), PALE, int(255*final))
        text_layer(im, (W//2, 972), "Engineering intelligence, evidenced.", font(22), MUTED, int(230*final))

    fade = min(1.0, t/.6, (DURATION-t)/.65)
    if fade < 1:
        im = Image.blend(Image.new("RGBA", im.size, (*NAVY,255)), im, max(0,fade))
    return im.convert("RGB")


def make_audio(path: Path):
    rate = 44100
    tt = np.arange(DURATION*rate)/rate
    audio = .025*np.sin(2*np.pi*55*tt) + .012*np.sin(2*np.pi*110*tt)
    mask = (tt>2.2) & (tt<6.4)
    phase = 2*np.pi*(120*(tt-2.2) + 34*(tt-2.2)**2)
    audio += mask*.028*((tt-2.2)/4.2)*np.sin(phase)
    impact = tt>=6.4
    audio += impact*.16*np.exp(-(tt-6.4)*3.8)*np.sin(2*np.pi*82*(tt-6.4))
    for start,freq in [(8.4,660),(11.2,880)]:
        m=tt>=start
        audio += m*.035*np.exp(-(tt-start)*2.5)*np.sin(2*np.pi*freq*(tt-start))
    audio *= np.minimum(1,tt/.5)*np.minimum(1,(DURATION-tt)/.8)
    pcm=np.int16(np.clip(audio,-1,1)*32767)
    with wave.open(str(path),"wb") as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(pcm.tobytes())


def main():
    silent=OUT/"engicite-unveiling-silent.mp4"
    audio=OUT/"engicite-unveiling-audio.wav"
    final=OUT/"engicite-logo-unveiling-15s-horizontal.mp4"
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    writer=imageio_ffmpeg.write_frames(str(silent),(W,H),fps=FPS,codec="libx264",quality=7,pix_fmt_in="rgb24",macro_block_size=8,output_params=["-pix_fmt","yuv420p","-movflags","+faststart"])
    writer.send(None)
    for i in range(FPS*DURATION): writer.send(np.asarray(frame_at(i/FPS)))
    writer.close()
    make_audio(audio)
    subprocess.run([ffmpeg,"-y","-i",str(silent),"-i",str(audio),"-c:v","copy","-c:a","aac","-b:a","160k","-shortest",str(final)],check=True)
    silent.unlink(missing_ok=True); audio.unlink(missing_ok=True)
    print(final)


if __name__ == "__main__": main()
