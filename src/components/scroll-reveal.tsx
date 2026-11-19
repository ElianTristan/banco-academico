"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ScrollReveal({children,className=""}:{children:ReactNode;className?:string}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const node=ref.current;
    if(!node||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    if(node.getBoundingClientRect().top<window.innerHeight*.92)return;
    node.classList.add("reveal-pending");
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(entry.isIntersecting){node.classList.remove("reveal-pending");node.classList.add("reveal-visible");observer.disconnect();break;}
      }
    },{rootMargin:"0px 0px -7% 0px",threshold:.04});
    observer.observe(node);
    return ()=>observer.disconnect();
  },[]);
  return <div ref={ref} className={className} data-motion="reveal">{children}</div>;
}
