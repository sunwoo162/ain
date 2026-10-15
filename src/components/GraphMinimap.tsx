import { useCallback, useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react';
import type { Core } from 'cytoscape';

type Projection = { minX:number; minY:number; factor:number; offsetX:number; offsetY:number; w:number; h:number };
const WIDTH=188, HEIGHT=122;

/** A lightweight canvas overview of the *visible* Cytoscape nodes. No extra graph engine. */
export function GraphMinimap({cy, graphRevision}:{
  cy:Core|null;
  graphRevision:unknown;
}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const projection=useRef<Projection|null>(null);
  const [ready,setReady]=useState(false);
  const repaint=useCallback(()=>{
    const element=canvas.current;
    if (!cy || !element || cy.destroyed()) return;
    const ctx=element.getContext('2d');
    if (!ctx) return;
    const pixelRatio=Math.min(2,window.devicePixelRatio||1);
    element.width=Math.round(WIDTH*pixelRatio);
    element.height=Math.round(HEIGHT*pixelRatio);
    ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    ctx.clearRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle='#0a1426';
    ctx.fillRect(0,0,WIDTH,HEIGHT);
    const nodes=cy.nodes();
    if (nodes.length===0){projection.current=null;setReady(false);return;}
    setReady(true);
    const b=nodes.boundingBox({includeLabels:false,includeOverlays:false});
    const minX=b.x1-45,minY=b.y1-45;
    const rangeX=Math.max(1,b.w+90),rangeY=Math.max(1,b.h+90);
    const factor=Math.min((WIDTH-12)/rangeX,(HEIGHT-12)/rangeY);
    const offsetX=(WIDTH-rangeX*factor)/2,offsetY=(HEIGHT-rangeY*factor)/2;
    projection.current={minX,minY,factor,offsetX,offsetY,w:WIDTH,h:HEIGHT};
    const x=(v:number)=>offsetX+(v-minX)*factor;
    const y=(v:number)=>offsetY+(v-minY)*factor;

    ctx.lineWidth=.6;ctx.strokeStyle='rgba(117,148,204,.33)';
    ctx.beginPath();
    cy.edges().forEach(e=>{
      const a=e.source().position(),b=e.target().position();
      ctx.moveTo(x(a.x),y(a.y));ctx.lineTo(x(b.x),y(b.y));
    });ctx.stroke();
    cy.nodes().forEach(node=>{
      const p=node.position(),kind=node.data('kind');
      const color=kind==='answer'?'#7be1cb':kind==='model'?'#aa98fa':'#95acd9';
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(x(p.x),y(p.y),kind==='answer'?2.5:1.8,0,Math.PI*2);ctx.fill();
    });

    const pan=cy.pan(),zoom=cy.zoom();
    if (zoom<=0) return;
    const viewX=x(-pan.x/zoom),viewY=y(-pan.y/zoom);
    const viewW=cy.width()/zoom*factor,viewH=cy.height()/zoom*factor;
    ctx.fillStyle='rgba(157,155,250,.10)';
    ctx.strokeStyle='#b2adff';ctx.lineWidth=1.25;
    ctx.fillRect(viewX,viewY,viewW,viewH);ctx.strokeRect(viewX,viewY,viewW,viewH);
  },[cy]);

  useEffect(()=>{
    if (!cy) return;
    let frame=0;
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;repaint();});};
    cy.on('pan zoom layoutstop add remove position resize',schedule);
    schedule();
    return ()=>{
      cy.off('pan zoom layoutstop add remove position resize',schedule);
      if(frame)cancelAnimationFrame(frame);
    };
  },[cy,graphRevision,repaint]);

  const focus=(x:number,y:number)=>{
    const p=projection.current;
    if(!cy||!p)return;
    const worldX=p.minX+(x-p.offsetX)/p.factor;
    const worldY=p.minY+(y-p.offsetY)/p.factor;
    const z=cy.zoom();
    cy.pan({x:cy.width()/2-worldX*z,y:cy.height()/2-worldY*z});
  };
  const click=(event:MouseEvent<HTMLCanvasElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    focus((event.clientX-rect.left)*WIDTH/rect.width,(event.clientY-rect.top)*HEIGHT/rect.height);
  };
  const keyboard=(event:KeyboardEvent<HTMLCanvasElement>)=>{
    if(!cy)return;
    const step=30;
    const pans:Record<string,[number,number]>={
      ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step],
    };
    const change=pans[event.key];
    if(change){event.preventDefault();cy.panBy({x:change[0],y:change[1]});}
  };
  return <div className="graph-minimap" aria-label="현재 그래프 미니맵">
    <div className="minimap-top"><strong>FIELD MAP</strong><span>{ready?'CLICK TO NAVIGATE':'NO SIGNAL'}</span></div>
    <canvas ref={canvas} width={WIDTH} height={HEIGHT} role="button" tabIndex={0}
      aria-label="미니맵. 클릭하여 이동, 방향키로 그래프 이동"
      onClick={click} onKeyDown={keyboard}/>
    <div className="minimap-footer"><span>VISIBLE TOPOLOGY</span><span>↗ NAVIGATE</span></div>
  </div>;
}
