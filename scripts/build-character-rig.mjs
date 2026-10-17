// Package original cutouts and ImageGen restoration plates into cropped WebP parts.
// All coordinates refer to the original 1407 × 1118 illustration, never the viewport.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const width = 1407, height = 1118;
const rigs = {
  sonya: {
    // The shoulder cut follows the sleeve seam; the hair behind it comes from the plate.
    arm: "M 826 551 Q 864 610 854 702 L 1000 620 L 1265 366 L 1407 310 L 1407 0 L 1160 0 L 1146 206 L 890 491 Z",
    armCut: "M 843 537 Q 881 596 871 688 L 1000 620 L 1265 366 L 1407 310 L 1407 0 L 1160 0 L 1146 206 L 890 491 Z",
    hand: "M 1148 198 L 1168 0 L 1407 0 L 1407 310 L 1220 354 Q 1160 322 1152 267 Z",
    handCut: "M 1148 198 L 1168 0 L 1407 0 L 1407 310 L 1220 337 Q 1160 305 1152 250 Z",
    shoulder: [852, 614], wrist: [1186, 304],
    hair: [
      { id: "hair-left", pivot: [484, 482],
        part: "M 460 454 L 505 476 L 554 538 L 573 649 L 526 687 L 439 570 Z",
        cut: "M 459 505 L 525 536 L 573 649 L 526 687 L 439 570 Z" },
      { id: "hair-right", pivot: [880, 172],
        part: "M 859 126 L 982 144 L 1267 608 L 1267 935 L 1050 1027 L 1020 970 L 1116 811 L 1057 618 L 903 340 L 874 273 Z",
        cut: "M 906 221 L 1010 240 L 1267 608 L 1267 935 L 1050 1027 L 1020 970 L 1116 811 L 1057 618 L 919 359 Z" },
    ],
  },
  yasuna: {
    arm: "M 0 0 L 295 0 L 293 241 L 435 385 L 531 465 Q 606 492 630 552 Q 669 615 621 694 L 562 767 L 406 578 L 155 349 L 0 298 Z",
    armCut: "M 0 0 L 295 0 L 293 241 L 435 385 L 531 465 Q 590 477 614 537 Q 653 600 605 679 L 546 752 L 406 578 L 155 349 L 0 298 Z",
    hand: "M 0 0 L 295 0 L 285 237 L 270 306 L 245 355 Q 205 343 175 294 L 0 282 Z",
    handCut: "M 0 0 L 295 0 L 285 237 L 270 288 L 245 337 Q 205 325 175 276 L 0 264 Z",
    shoulder: [598, 596], wrist: [220, 309],
    hair: [
      { id: "hair-left", pivot: [535, 355],
        part: "M 535 304 L 542 341 L 528 389 L 530 435 L 577 475 L 621 506 L 659 534 L 652 566 L 534 583 L 390 506 L 387 335 Z",
        cut: "M 501 342 L 516 388 L 516 440 L 560 484 L 610 519 L 648 543 L 652 566 L 534 583 L 390 506 L 387 355 Z" },
      { id: "hair-right", pivot: [982, 353],
        part: "M 978 321 L 1040 336 L 1105 479 L 1097 552 L 1009 610 L 883 615 L 849 568 L 914 516 L 946 468 L 939 414 Z",
        cut: "M 988 379 L 1062 384 L 1105 479 L 1097 552 L 1009 610 L 883 615 L 866 577 L 932 521 L 960 473 L 955 416 Z" },
    ],
  },
};

const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
const path = (d, fill = "white", extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;
const mask = (paths, inverse = false) => inverse
  ? svg(`<defs><mask id="cut"><rect width="100%" height="100%" fill="white"/>${paths.map(d=>path(d,"black")).join("")}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#cut)"/>`)
  : svg(paths.map(d=>path(d)).join(""));
const isolate = (source, paths, inverse = false) => sharp(source).composite([{input: mask(paths, inverse), blend: "dest-in"}]).png().toBuffer();

await mkdir("public/media/characters", { recursive: true });
await mkdir("src/data", { recursive: true });
const manifest = {};
for (const [name, rig] of Object.entries(rigs)) {
  const original = `public/media/${name}-hands.png`;
  const plate = `assets/character-motion/${name}-restored.png`;
  // Original face/clothes remain pixel-identical; restoration is confined to the removed arm.
  const withoutArm = await isolate(original, [rig.armCut], true);
  // Extend the restoration beneath the cut edge to avoid a translucent antialias seam.
  const restoration = await sharp(plate).composite([{input:svg(path(rig.armCut,"white",'stroke="white" stroke-width="4"')),blend:"dest-in"}]).png().toBuffer();
  const restored = await sharp(restoration).composite([{ input: withoutArm }]).png().toBuffer();
  const base = await isolate(restored, rig.hair.map(h => h.cut), true);
  const arm = await isolate(original, [rig.arm]);
  // Leave a short cuff underlap in the sleeve so wrist rotation never exposes a slit.
  const sleeve = await isolate(arm, [rig.handCut], true);
  const hand = await isolate(arm, [rig.hand]);
  const parts = [];
  async function pack(id, source, pivot, parent = null) {
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=width, top=height, right=0, bottom=0;
    for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
      if(data[(y*width+x)*info.channels+3] > 0) {
        left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
      }
    }
    left=Math.max(0,left-2); top=Math.max(0,top-2);
    right=Math.min(width-1,right+2); bottom=Math.min(height-1,bottom+2);
    const rect={left,top,width:right-left+1,height:bottom-top+1};
    const file=`${name}-${id}.webp`;
    const output=await sharp(source).extract(rect).webp({quality:92,alphaQuality:100,effort:6}).toBuffer();
    await writeFile(`public/media/characters/${file}`,output);
    parts.push({id,src:`/media/characters/${file}`,x:left,y:top,width:rect.width,height:rect.height,pivot,parent,bytes:output.length});
  }
  for (const hair of rig.hair) await pack(hair.id,await isolate(restored,[hair.part]),hair.pivot);
  await pack("body",base,null);
  await pack("sleeve",sleeve,null,"arm");
  await pack("hand",hand,rig.wrist,"arm");
  const armParts=parts.filter(p=>p.parent==="arm");
  const x=Math.min(...armParts.map(p=>p.x)), y=Math.min(...armParts.map(p=>p.y));
  const armBox={x,y,width:Math.max(...armParts.map(p=>p.x+p.width))-x,height:Math.max(...armParts.map(p=>p.y+p.height))-y,pivot:rig.shoulder};
  manifest[name]={width,height,arm:armBox,parts};
  console.log(`${name}: ${parts.length} parts, ${parts.reduce((sum,p)=>sum+p.bytes,0)} bytes; decoded pixels: ${parts.reduce((sum,p)=>sum+p.width*p.height,0)}`);
}
await writeFile("src/data/character-rigs.json",JSON.stringify(manifest,null,2)+"\n");
