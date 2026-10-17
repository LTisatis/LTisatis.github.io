export type AlphaMask = { width: number; height: number; alpha: Uint8Array };

/** Test the visible triangles, mapping the current pose back to texture alpha.
 * Runs only on activation, never adds a full-canvas event layer or GPU readback. */
export function hitMesh(
	x: number, y: number, positions: ArrayLike<number>, original: ArrayLike<number>,
	columns: number, width: number, height: number, mask: AlphaMask,
) {
	function triangle(a: number, b: number, c: number) {
		const ax=positions[a*2];
		const ay=positions[a*2+1];
		const bx=positions[b*2];
		const by=positions[b*2+1];
		const cx=positions[c*2];
		const cy=positions[c*2+1];
		if(x<Math.min(ax,bx,cx)||x>Math.max(ax,bx,cx)||y<Math.min(ay,by,cy)||y>Math.max(ay,by,cy))return false;
		const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
		if(Math.abs(det)<1e-8)return false;
		const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/det;
		const v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det;
		const w=1-u-v;
		if(u<0||v<0||w<0)return false;
		const tx=(original[a*2]*u+original[b*2]*v+original[c*2]*w)/width;
		const ty=(original[a*2+1]*u+original[b*2+1]*v+original[c*2+1]*w)/height;
		const mx=Math.max(0,Math.min(mask.width-1,Math.floor(tx*mask.width)));
		const my=Math.max(0,Math.min(mask.height-1,Math.floor(ty*mask.height)));
		return mask.alpha[my*mask.width+mx]>=64;
	}
	for(let j=0;j<positions.length/2-columns;j++)if(j%columns!==columns-1){
		if(triangle(j,j+1,j+columns)||triangle(j+1,j+columns+1,j+columns))return true;
	}
	return false;
}
