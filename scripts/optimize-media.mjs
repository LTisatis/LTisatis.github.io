import { spawnSync } from "node:child_process";
import { statSync, copyFileSync } from "node:fs";
import sharp from "sharp";

// Originals stay intact. Run with FFMPEG pointing to a local FFmpeg executable.
const ffmpeg = process.env.FFMPEG || "ffmpeg";
function encode(args) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`FFmpeg exited with ${result.status}`);
}
encode(["-i", "public/media/waaaa.mp3", "-map", "0:a:0", "-map_metadata", "-1", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "public/media/waaaa-web.m4a"]);
await sharp("public/media/cover.jpg").resize(96, 96).webp({ quality: 80 }).toFile("public/media/cover-small.webp");
for (const name of ["banner", ...[2, 3, 4, 5, 6].map(id => `scene/${id}`)]) {
  const source = `public/media/${name}.mp4`;
  encode(["-i", source, "-frames:v", "1", "-vf", "scale='min(480,iw)':-2", "-c:v", "libwebp", "-quality", "80", `public/media/${name}-poster.webp`]);
  if (name === "banner") continue; // The existing 30 KB clip is already small.
  const output = `public/media/${name}-web.mp4`;
  encode(["-i", source, "-map", "0:v:0", "-an", "-vf", "scale='min(480,iw)':-2,fps=24", "-c:v", "libx264", "-preset", "medium", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
  if (statSync(output).size > statSync(source).size) copyFileSync(source, output);
  console.log(`${name}: ${statSync(source).size} -> ${statSync(output).size} bytes`);
}
console.log(`Music: ${statSync("public/media/waaaa.mp3").size} -> ${statSync("public/media/waaaa-web.m4a").size} bytes`);
