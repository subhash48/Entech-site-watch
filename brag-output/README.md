# SiteWatch AI launch video

- `brag.mp4`: 21 s, 1920×1080, 30 fps, H.264 + AAC, loudness -16 LUFS. Frame 0 is the poster.
- `brag.jpg`: poster (the settled "Every site. Every limit. One screen." frame).
- `share-copy.txt`: caption, postable as-is.
- `brag-plan.md`: angle, answers and storyboard.

Everything on screen is the real app: 2× captures of the running compact dashboard, the Data Management
validation report (including the `'loud'` row), the activated dataset, a live Groq GPT-OSS 120B answer
citing `week46.csv (dataset v1)`, and the Reports page. Only the typed question, the cursor and the download
toast are drawn for the animation.

## Rebuild

`work/` holds the sources (rendered frames and other bulky intermediates are git-ignored):

```powershell
# from frontend/ (Playwright resolves from there), with the app on :3071 and an API on :8071 started with a
# throwaway SQLite DATABASE_URL and ADMIN_TOKEN; pass the same token as BRAG_ADMIN_TOKEN
node ../brag-output/work/capture.cjs        # real UI captures -> work/assets
node ../brag-output/work/audio.cjs          # offline Web Audio score + SFX -> work/soundtrack.wav
node ../brag-output/work/render.cjs all     # stage.html, frame by frame -> work/frames
cd ../brag-output
ffmpeg -i work/soundtrack.wav -af "loudnorm=I=-16:TP=-1.5:LRA=7" -ar 48000 work/soundtrack-norm.wav
ffmpeg -framerate 30 -i work/frames/%05d.png -i work/soundtrack-norm.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart brag.mp4
```
