'use strict';
// Continuous 2.5D deformation of approved artwork; not angular sprite selection or a Cubism model.
class ShadowCyrenePuppet {
  constructor(canvas,image){
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true});this.gl=gl;
    if(!gl)throw new Error('当前设备未提供 WebGL，无法启用连续桌宠动画。');
    const vertex=`
      attribute vec2 aPosition; varying vec2 vSource;
      uniform vec2 uHead;
      void main(){
        vSource=aPosition;vec2 p=aPosition;
        float head=1.0-smoothstep(84.0,98.0,p.y);
        // Translation only. Neck fade ends above shoulders; no scale, tilt, or torso motion.
        p.x+=uHead.x*1.3*head;
        p.y+=uHead.y*0.8*head;
        gl_Position=vec4(p.x/96.0-1.0,1.0-p.y/104.0,0.0,1.0);
      }`;
    const fragment=`
      precision mediump float; varying vec2 vSource;
      uniform sampler2D uAtlas; uniform vec2 uFrame; uniform vec2 uEyes;
      uniform float uEyeMotion; uniform float uOpacity;
      void main(){
        vec2 p=vSource;
        float left=1.0-smoothstep(0.25,1.0,length((p-vec2(85.0,71.0))/vec2(8.0,8.0)));
        float right=1.0-smoothstep(0.25,1.0,length((p-vec2(111.0,71.0))/vec2(8.0,8.0)));
        p-=uEyes*vec2(1.65,1.4)*max(left,right)*uEyeMotion;
        p=clamp(p,vec2(0.5),vec2(191.5,207.5));
        vec4 pose=texture2D(uAtlas,(uFrame*vec2(192.0,208.0)+p)/vec2(1536.0,2288.0));
        if(uFrame.y<0.5){
          // Standing body always uses the identical neutral pixels. Only the eye patch blinks.
          vec4 neutral=texture2D(uAtlas,p/vec2(1536.0,2288.0));
          float eyePatch=smoothstep(71.0,75.0,vSource.x)*(1.0-smoothstep(121.0,125.0,vSource.x));
          eyePatch*=smoothstep(57.0,60.0,vSource.y)*(1.0-smoothstep(80.0,84.0,vSource.y));
          pose=mix(neutral,pose,eyePatch);
        }
        gl_FragColor=pose*uOpacity;
      }`;
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
    this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('连续动画着色器无法链接。');gl.useProgram(this.program);
    const data=[],cols=32,rows=32;
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const x0=x*192/cols,x1=(x+1)*192/cols,y0=y*208/rows,y1=(y+1)*208/rows;
      data.push(x0,y0,x1,y0,x0,y1,x0,y1,x1,y0,x1,y1);
    }
    this.count=data.length/2;const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(this.program,'aPosition');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    this.uniforms={};for(const name of ['uHead','uEyes','uFrame','uEyeMotion','uOpacity'])this.uniforms[name]=gl.getUniformLocation(this.program,name);
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.clearColor(0,0,0,0);gl.viewport(0,0,canvas.width,canvas.height);
  }
  begin(head,eyes){const gl=this.gl,u=this.uniforms;gl.viewport(0,0,gl.canvas.width,gl.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(u.uHead,head.x,head.y);gl.uniform2f(u.uEyes,eyes.x,eyes.y);}
  draw(key,opacity){
    if(opacity<=0)return;const [row,col]=key.split(':').map(Number);const gl=this.gl,u=this.uniforms;
    gl.uniform2f(u.uFrame,col,row);gl.uniform1f(u.uOpacity,opacity);gl.uniform1f(u.uEyeMotion,row===0&&[0,1,4,5].includes(col)?1:0);gl.drawArrays(gl.TRIANGLES,0,this.count);
  }
}
window.ShadowCyrenePuppet=ShadowCyrenePuppet;
