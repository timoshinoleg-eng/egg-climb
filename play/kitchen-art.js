// Original procedural materials. Created once, reused via affine face mapping.
const palettes = {
  table: ['#dfbd82', '#ba8d59', '#ac7b4c'],
  'cutting-board': ['#edcf98', '#c9a56b', '#b38c55'],
  counter: ['#f5f0df', '#acc5b5', '#87aa99'],
  toaster: ['#ebd5b8', '#c58161', '#a76550'],
  fridge: ['#dce6d9', '#9db8aa', '#76988c'],
  'moving-cabinet': ['#dae6c0', '#81966f', '#647e5e'],
  hood: ['#e3e5df', '#b9c6bd', '#97aba0'],
  vent: ['#e9e8d8', '#b9cbb9', '#94af9c'],
}

export function createTilePattern(ctx, wall = false) {
  const tile = document.createElement('canvas'); tile.width = 128; tile.height = 128
  const c = tile.getContext('2d')
  c.fillStyle = wall ? '#e9e5d6' : '#e6dfc9'; c.fillRect(0, 0, 128, 128)
  c.fillStyle = wall ? '#f1ede0' : '#f0ead9'; c.fillRect(0,0,64,64);c.fillRect(64,64,64,64)
  c.strokeStyle = wall ? '#d3d7c6' : '#c8c5af';c.lineWidth = 1
  c.strokeRect(2,2,60,60);c.strokeRect(66,2,60,60);c.strokeRect(2,66,60,60);c.strokeRect(66,66,60,60)
  return { canvas: tile, pattern: ctx.createPattern(tile, 'repeat') }
}

export function createKitchenMaterials() {
  const textures = new Map()
  for (const [id, colors] of Object.entries(palettes)) {
    for (const face of ['top','front','side']) {
      const canvas = document.createElement('canvas');canvas.width=384;canvas.height=face==='top'?384:80
      const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height
      c.fillStyle=colors[face==='top'?0:face==='front'?1:2];c.fillRect(0,0,w,h)
      c.fillStyle='#ffffff2b';c.fillRect(0,0,w,face==='top'?4:8)
      c.fillStyle='#314f3912';c.fillRect(0,h-5,w,5)
      if((id==='table'||id==='cutting-board')&&face==='top'){
        for(let n=0;n<28;n++){
          c.strokeStyle=n%2?'#7f593222':'#fff5ce44';c.lineWidth=1+n%2
          const y=(n*31.17)%h;c.beginPath();c.moveTo(0,y);c.bezierCurveTo(w*.25,y+12,w*.65,y-10,w,y+3);c.stroke()
        }
        if(id==='cutting-board'){c.strokeStyle='#9e75442b';c.lineWidth=1;for(let n=0;n<9;n++){c.beginPath();c.moveTo(55+n*26,130);c.lineTo(90+n*24,220);c.stroke()}}
      }
      if(id==='counter'&&face==='top'){
        c.strokeStyle='#b8c4b1';c.lineWidth=2
        for(let x=0;x<w;x+=96){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}
        for(let y=0;y<h;y+=96){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}
      }
      if(id==='toaster'&&face==='top'){
        for(const x of [102,244]){
          c.fillStyle='#b18b6a';c.beginPath();c.roundRect(x-13,54,78,270,25);c.fill()
          c.fillStyle='#4f5447';c.beginPath();c.roundRect(x,65,51,246,17);c.fill()
          c.fillStyle='#e5b46c';c.fillRect(x+7,79,37,8)
        }
      }
      if((id==='vent'||id==='hood')&&face==='top'){
        c.strokeStyle=id==='vent'?'#819e8b':'#a6b6aa';c.lineWidth=7;c.lineCap='round'
        for(let y=44;y<h-25;y+=29){c.beginPath();c.moveTo(55,y);c.lineTo(w-55,y);c.stroke()}
      }
      if(face==='front'){
        if(id==='table'||id==='cutting-board'){c.strokeStyle='#fff1cb44';c.lineWidth=2;c.beginPath();c.moveTo(10,26);c.lineTo(w-10,26);c.stroke()}
        if(id==='fridge'||id==='counter'||id==='moving-cabinet'){
          c.fillStyle='#476858';c.beginPath();c.roundRect(w*.42,h*.45,w*.16,7,4);c.fill()
          c.strokeStyle='#4e735b44';c.lineWidth=2;c.strokeRect(9,15,w-18,h-24)
        }
        if(id==='toaster'){
          c.fillStyle='#fff0cf';c.font='600 18px sans-serif';c.textAlign='center';c.fillText('TOAST',w*.45,48)
          c.fillStyle='#555c48';c.beginPath();c.arc(w-40,h*.52,13,0,Math.PI*2);c.fill()
          c.strokeStyle='#f0d79e';c.lineWidth=2;c.beginPath();c.moveTo(w-40,h*.52-8);c.lineTo(w-40,h*.52-2);c.stroke()
        }
      }
      textures.set(`${id}:${face}`,canvas)
    }
  }
  return textures
}
