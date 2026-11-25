import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        for f, o in [(a.split('=')[0], a.split('=')[1]) for a in sys.argv[1:]]:
            pg=await b.new_page(); pg.on('pageerror',lambda e:print('ERR',e))
            await pg.goto('http://localhost:8765/profs/geo.html?f='+f); await pg.wait_for_function('window.ready',timeout=120000)
            open(o,'w').write(await pg.evaluate('window.out')); print('ok', o)
        await b.close()
asyncio.run(main())
