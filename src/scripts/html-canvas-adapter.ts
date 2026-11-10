/** Optional native HTML-to-texture bridge. Unsupported browsers keep normal DOM. */
type DrawableCanvas = HTMLCanvasElement & {
  requestPaint?: () => void;
  getElementImageDefaultSize?: (element: Element) => { width: number; height: number };
  updateElementGeometry?: (element: Element, options: { canvasTransform: DOMMatrix }) => void;
};
type DrawableGL = WebGL2RenderingContext & {
  texElementSubImage2D?: (target: number, level: number, x: number, y: number, element: Element) => void;
  texElementImage2D?: (...args: unknown[]) => void;
};
export type CanvasSurface = {
  render: (time: number, strength: number, x: number, y: number) => void;
  repaint: () => void;
  resize: () => void;
  destroy: () => void;
};

const vertex = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main(){ vUv=vec2(aPosition.x*.5+.5,.5-aPosition.y*.5); gl_Position=vec4(aPosition,0.,1.); }`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uCard;
uniform vec4 uCover;
uniform vec2 uPointer;
uniform vec2 uSize;
uniform float uTime;
uniform float uStrength;
in vec2 vUv;
out vec4 outColor;
void main(){
 vec2 uv=vUv;
 float cover=step(uCover.x,uv.x)*step(uCover.y,uv.y)*step(uv.x,uCover.z)*step(uv.y,uCover.w);
 vec2 delta=(uv-uPointer)*vec2(uSize.x/uSize.y,1.);
 float d=length(delta);
 float ripple=sin(d*32.-uTime*3.)*exp(-d*4.)*.006*uStrength*cover;
 uv+=normalize(delta+vec2(.0001))*ripple;
 vec4 color=texture(uCard,clamp(uv,vec2(.001),vec2(.999)));
 float edge=min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y));
 float shine=exp(-edge*85.)*exp(-length(delta)*3.)*uStrength;
 float flow=pow(.5+.5*sin((vUv.x+vUv.y)*11.-uTime*2.5),4.);
 float rim=exp(-edge*110.)*flow*uStrength;
 color.rgb+=(vec3(.12,.055,.095)*shine+vec3(.15,.06,.12)*rim)*color.a;
 outColor=color;
}`;

export async function mountHtmlCanvas(
  host: HTMLElement,
  source: HTMLElement,
  onFailure: () => void,
  signal?: AbortSignal,
): Promise<CanvasSurface | null> {
  const inspect = ["127.0.0.1", "localhost", "::1"].includes(location.hostname);
  const diagnose = (reason: string) => { if (inspect) host.dataset.canvasReason = reason; };
  if (signal?.aborted) { diagnose("cancelled"); return null; }
  diagnose("probing");
  const canvas = document.createElement("canvas") as DrawableCanvas;
  canvas.setAttribute("content", "drawable");
  canvas.setAttribute("layoutsubtree", "");
  // Content remains accessible; this canvas is separate from the decorative one.
  const paintMethod = canvas.requestPaint?.bind(canvas);
  const geometryMethod = canvas.updateElementGeometry?.bind(canvas);
  if (!paintMethod || !geometryMethod) { diagnose("missing-api"); return null; }
  const requestPaint = paintMethod;
  const updateElementGeometry = geometryMethod;
  const context = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true }) as DrawableGL | null;
  if (!context) { diagnose("missing-webgl"); return null; }
  const gl = context;
  if (!gl.texElementSubImage2D && !gl.texElementImage2D) {
    diagnose("missing-upload");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  const resources: { shaders: WebGLShader[]; program?: WebGLProgram; buffer?: WebGLBuffer; texture?: WebGLTexture } = { shaders: [] };
  const placeholder = document.createComment("canvas-feature-source");
  const oldStyle = source.getAttribute("style");
  const oldMinHeight = host.style.minHeight;
  const hadDrawable = source.hasAttribute("drawable");
  const clone = source.cloneNode(true) as HTMLElement;
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;
  clone.dataset.canvasPlaceholder = "";
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach(el => { el.removeAttribute("id"); });
  let disposed = false;
  let ready = false;
  let promoted = false;
  let uploadElement = clone;
  let allocatedWidth = 0;
  let allocatedHeight = 0;
  let latest = { time: 0, strength: 0, x: .5, y: .5 };
  let settle: ((success: boolean) => void) | undefined;
  let timeout = 0;
  let cover = [1, 1, 0, 0];
  let width = Math.max(1, source.offsetWidth);
  let height = Math.max(1, source.offsetHeight);

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeout);
    settle?.(false); settle = undefined;
    canvas.removeEventListener("paint", paint);
    canvas.removeEventListener("webglcontextlost", contextLost);
    signal?.removeEventListener("abort", cancel);
    if (promoted) {
      if (placeholder.parentNode) placeholder.replaceWith(source);
      if (oldStyle === null) source.removeAttribute("style"); else source.setAttribute("style", oldStyle);
      source.classList.remove("canvas-source");
      if (!hadDrawable) source.removeAttribute("drawable");
    } else placeholder.remove();
    clone.remove(); canvas.remove();
    host.style.minHeight = oldMinHeight;
    host.dataset.canvasMode = "fallback";
    if (resources.texture) gl?.deleteTexture(resources.texture);
    if (resources.buffer) gl?.deleteBuffer(resources.buffer);
    if (resources.program) gl?.deleteProgram(resources.program);
    for (const shader of resources.shaders) gl?.deleteShader(shader);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  function cancel() { diagnose("cancelled"); dispose(); }
  function fail(reason: string) { diagnose(reason); dispose(); onFailure(); }
  function contextLost(event: Event) { event.preventDefault(); fail("context-lost"); }
  function compile(type: number, code: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to allocate shader");
    resources.shaders.push(shader);
    gl.shaderSource(shader, code); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Card shader unavailable");
    return shader;
  }
  function render(time: number, strength: number, x: number, y: number) {
    latest = { time, strength, x, y };
    if (disposed || !ready || !resources.program) return;
    try {
      gl.useProgram(resources.program);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(gl.getUniformLocation(resources.program, "uTime"), time);
      gl.uniform1f(gl.getUniformLocation(resources.program, "uStrength"), strength);
      gl.uniform2f(gl.getUniformLocation(resources.program, "uPointer"), x, y);
      gl.uniform2f(gl.getUniformLocation(resources.program, "uSize"), width, height);
      gl.uniform4fv(gl.getUniformLocation(resources.program, "uCover"), cover);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } catch { fail("render-failed"); }
  }
  function geometry() {
    // CSS perspective belongs to the host. Inside the canvas, HTML stays planar.
    updateElementGeometry(uploadElement, { canvasTransform: new DOMMatrix() });
  }
  function paint() {
    if (disposed) return;
    try {
      const texture = resources.texture;
      if (!texture) throw new Error("Card texture unavailable");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (gl.texElementSubImage2D) {
        if (allocatedWidth !== canvas.width || allocatedHeight !== canvas.height) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          allocatedWidth = canvas.width; allocatedHeight = canvas.height;
        }
        gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, uploadElement);
      } else {
        const upload = gl.texElementImage2D;
        if (!upload) throw new Error("HTML texture upload unavailable");
        if (upload.length === 3) upload.call(gl, gl.TEXTURE_2D, gl.RGBA8, uploadElement);
        else upload.call(gl, gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uploadElement);
      }
      if (gl.getError() !== gl.NO_ERROR) throw new Error("HTML texture upload unavailable");
      geometry(); ready = true;
      render(latest.time, latest.strength, latest.x, latest.y);
      if (disposed) return;
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width/2), Math.floor(canvas.height/2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (gl.getError() !== gl.NO_ERROR || pixel[3] === 0) throw new Error("HTML texture is blank");
      if (!promoted) {
        // The semantic card remains usable until a real, nonblank upload succeeds.
        if (source.contains(document.activeElement)) { diagnose("focused-dom"); dispose(); return; }
        source.before(placeholder);
        source.classList.add("canvas-source");
        source.style.width = `${width}px`;
        source.setAttribute("drawable", "");
        canvas.append(source);
        uploadElement = source; promoted = true;
        geometry(); canvas.style.pointerEvents = "auto";
        host.dataset.canvasMode = "html";
        requestPaint();
        return;
      }
      clone.remove();
      host.dataset.canvasMode = "html";
      diagnose("ready"); clearTimeout(timeout);
      settle?.(true); settle = undefined;
    } catch { fail("upload-failed"); }
  }
  function resize() {
    if (disposed) return;
    width = Math.max(1, host.clientWidth);
    uploadElement.style.width = `${width}px`;
    height = Math.max(1, uploadElement.offsetHeight);
    const textureSize = canvas.getElementImageDefaultSize?.(uploadElement);
    const nextWidth = Math.max(1, Math.ceil(textureSize?.width ?? width));
    const nextHeight = Math.max(1, Math.ceil(textureSize?.height ?? height));
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    canvas.style.height = `${height}px`; host.style.minHeight = `${height}px`;
    const image = uploadElement.querySelector<HTMLElement>(".post-card-cover");
    if (image) cover = [image.offsetLeft/width, image.offsetTop/height,
      (image.offsetLeft+image.offsetWidth)/width, (image.offsetTop+image.offsetHeight)/height];
    requestPaint();
  }
  try {
    const program = gl.createProgram();
    if (!program) throw new Error("Card GPU program unavailable");
    resources.program = program;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Card GPU program unavailable");
    gl.useProgram(program);
    resources.buffer = gl.createBuffer() ?? undefined;
    if (!resources.buffer) throw new Error("Card GPU buffer unavailable");
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    resources.texture = gl.createTexture() ?? undefined;
    if (!resources.texture) throw new Error("Card texture unavailable");
    gl.bindTexture(gl.TEXTURE_2D, resources.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    host.append(canvas);
    canvas.style.position = "absolute"; canvas.style.inset = "0"; canvas.style.pointerEvents = "none";
    canvas.append(clone); clone.classList.add("canvas-source"); clone.setAttribute("drawable", "");
    canvas.addEventListener("paint", paint);
    canvas.addEventListener("webglcontextlost", contextLost);
    signal?.addEventListener("abort", cancel, { once: true });
    const uploaded = new Promise<boolean>(resolve => {
      settle = resolve;
      timeout = window.setTimeout(() => { diagnose("paint-timeout"); dispose(); resolve(false); }, 1500);
    });
    resize();
    if (!await uploaded || disposed) return null;
    return { render, resize, repaint: () => { if (!disposed) requestPaint(); }, destroy: dispose };
  } catch { diagnose("setup-failed"); dispose(); return null; }
}
