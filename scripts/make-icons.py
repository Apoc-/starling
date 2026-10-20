import zlib, struct
from pathlib import Path
root=Path('/opt/data/projects/starling/public/icons');root.mkdir(parents=True,exist_ok=True)
def png(size):
    rows=[]
    star=[(256,158),(278,234),(354,256),(278,278),(256,354),(234,278),(158,256),(234,234)]
    def inside(x,y):
        result=False;j=len(star)-1
        for i,(xi,yi) in enumerate(star):
            xj,yj=star[j]
            if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi:result=not result
            j=i
        return result
    for y in range(size):
        row=bytearray([0])
        for x in range(size):
            px=(x+.5)*512/size;py=(y+.5)*512/size
            color=(16,43,48)
            if (px-256)**2+(py-256)**2<151**2:
                t=min(1,max(0,(px+py-210)/600));color=(int(255-26*t),int(207-66*t),int(149-59*t))
            if inside(px,py) or (px-315)**2+(py-197)**2<7**2:color=(255,243,217)
            row.extend(color)
        rows.append(bytes(row))
    def chunk(typ,data):return struct.pack('!I',len(data))+typ+data+struct.pack('!I',zlib.crc32(typ+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')
for size in [192,512]:(root/f'icon-{size}.png').write_bytes(png(size))
print('Generated 192px and 512px PNG icons with maskable safe-area artwork.')
