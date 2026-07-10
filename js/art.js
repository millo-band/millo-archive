/* ============================================
   MILLO ARCHIVE v11 — art.js
   50-Algorithm Procedural 1-Bit Art Generator.
   Moved verbatim from v10 app.js — DO NOT TWEAK THE ALGORITHMS.
============================================ */

export function generatePixelArt(canvasId, seedString) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const size = 64;
  canvas.width = size;
  canvas.height = size;

  ctx.fillStyle = '#FF91AF';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';

  let hash = 0;
  for (let i = 0; i < seedString.length; i++) hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
  function random() { const x = Math.sin(hash++) * 10000; return x - Math.floor(x); }

  const artType = Math.floor(random() * 50);

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let nx=(x-32)/32, ny=(y-32)/32;
      let ax=Math.abs(nx), ay=Math.abs(ny);
      let r=Math.sqrt(nx*nx+ny*ny), a=Math.atan2(ny,nx);
      let draw=false;

      switch (artType) {
        case 0:  draw = nx*nx*2+ny*ny*8<1&&r>0.15; break;
        case 1:  draw = ny>ax-0.2+Math.sin(nx*15)*0.1; break;
        case 2:  draw = (ax<0.1&&ny>0)||(nx*nx+(ny+0.3)**2<0.3); break;
        case 3:  draw = (x%16<14)&&(y%16<14); break;
        case 4:  draw = (nx+0.5)**2+ny**2<0.1||(nx-0.5)**2+ny**2<0.1||(ny>-0.1&&ny<0&&ax<0.5); break;
        case 5:  draw = Math.abs(Math.sin(ny*10)-nx)<0.1||Math.abs(Math.sin(ny*10+3.14)-nx)<0.1||(y%8<2&&ax<0.8); break;
        case 6:  draw = ax<0.4&&ny>-0.6&&!(nx>0.2&&nx<0.3&&ay<0.05); break;
        case 7:  draw = ((nx+0.3)**2+(ny+0.3)**2<0.1)||(random()<0.05)||(ny>0.6&&Math.sin(nx*10)>0); break;
        case 8:  draw = ny>0.1&&(x%12<10)&&(y%8<6)&&random()<0.8; break;
        case 9:  draw = r<0.7&&!(ny<0&&Math.abs(ax-0.3)<0.1)&&!(ny>0.3&&ax<0.2); break;
        case 10: draw = ny>Math.sin(nx*10)*0.3; break;
        case 11: draw = Math.sin(nx*20)*Math.sin(ny*20)>0; break;
        case 12: draw = ny>ax&&(y%6<4); break;
        case 13: draw = ax<0.05&&ny>-0.8&&ny<0.6||(ax<0.3&&Math.abs(ny-0.5)<0.05); break;
        case 14: draw = ny<0.5-nx*nx&&ny>-0.6&&ax<0.6&&r>0.2; break;
        case 15: draw = r<0.5+0.2*Math.sin(a*5)&&r>0.1; break;
        case 16: draw = r<0.3||Math.sin(a*12)>0.8; break;
        case 17: draw = r<0.5&&(nx-0.2)**2+(ny-0.2)**2>0.4; break;
        case 18: draw = r<0.3||(nx-0.3)**2+(ny+0.1)**2<0.2||(nx+0.3)**2+(ny+0.2)**2<0.2; break;
        case 19: draw = Math.abs(nx-Math.sin(ny*15)*0.1-ny*0.2)<0.05; break;
        case 20: draw = (nx*nx+ny*ny-0.3)**3-nx*nx*ny*ny*ny<0; break;
        case 21: draw = (x+y)%10<2&&random()<0.5; break;
        case 22: draw = (r%0.2<0.05)||(Math.abs(Math.sin(a*4))<0.1); break;
        case 23: draw = Math.sin(r*30)>0; break;
        case 24: draw = Math.sin(r*30-a*3)>0; break;
        case 25: draw = (x%4===0||y%4===0)&&random()>0.2; break;
        case 26: draw = ny>0&&(Math.sin(nx/ny*10)>0||Math.sin(1/ny*5)>0); break;
        case 27: draw = ny>0&&y%4<3&&nx*10-Math.floor(nx*10)<0.8&&random()>0.3; break;
        case 28: draw = ax<0.6&&ay<0.4&&!(ay<0.1&&Math.abs(ax-0.3)<0.1); break;
        case 29: draw = r<0.7&&r>0.1&&Math.sin(r*40)>-0.5; break;
        case 30: draw = (nx*nx+ny*ny*16<0.2)||(nx*nx*2+(ny+0.2)**2*2<0.1); break;
        case 31: draw = nx+ny>0&&(x%8<7)&&(y%8<7); break;
        case 32: draw = ax<ay+0.1&&ay<0.7; break;
        case 33: draw = ax<0.6&&Math.abs(ny-Math.sin(nx*5)*0.2)<0.3; break;
        case 34: draw = ax<0.5&&ay<0.5&&ax>0.05&&ay>0.05; break;
        case 35: draw = ax+ay<0.6&&r>0.1; break;
        case 36: draw = ax<0.6&&ay<0.4&&(Math.abs(nx-ny)<0.05||Math.abs(nx+ny)<0.05); break;
        case 37: draw = ax<0.6&&ay<0.4&&ax>0.05; break;
        case 38: draw = (ax<0.3&&ny>-0.4&&ny<0.4)||(nx>0.3&&nx<0.5&&ay<0.2&&Math.abs(nx-0.4)>0.05); break;
        case 39: draw = ((nx-0.4)**2+ny**2<0.05)||((nx+0.4)**2+ny**2<0.05)||(ay<0.02&&ax<0.4); break;
        case 40: draw = ay<ax&&ax<0.6; break;
        case 41: draw = r<0.6&&Math.cos(a*5)>0.5; break;
        case 42: draw = r<0.3||(Math.abs(ny-nx*0.5)<0.05&&ax<0.6); break;
        case 43: draw = ay<0.4&&Math.sin(nx*Math.sin(nx*50)*50)>0; break;
        case 44: draw = (ax<0.4&&ay<0.6)&&!(ax<0.3&&ay<0.5&&ny<0)||(ax<0.1&&ny<-0.6&&ny>-0.7); break;
        case 45: draw = ax<0.5&&ay<0.5&&!(nx>0.1&&nx<0.4&&ny<-0.2); break;
        case 46: draw = ax<0.5&&ny>0&&ny<0.5-Math.abs(Math.sin(nx*10)*0.2); break;
        case 47: draw = ax<0.05&&ay<0.5||(r>0.4&&r<0.5&&ny>0)||(ay<0.05&&ax<0.3); break;
        case 48: draw = ax<0.4&&ay<0.4&&r>0.1; break;
        case 49: draw = (nx*nx+ny*ny*2<0.3)&&!(Math.abs(ax-0.2)<0.1&&ny<0.1&&ny>-0.1); break;
      }

      if (draw) ctx.fillRect(x, y, 1, 1);
      else if (random() < 0.03) ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas.toDataURL('image/png');
}
