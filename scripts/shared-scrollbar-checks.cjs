const assert = require('node:assert/strict');
const tracks = new Map();

module.exports = async (page, dark) => {
  await page.waitForFunction(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--appdock-scrollbar-thumb').trim(),
  );
  const sample = await page.evaluate(() => {
    const scroller = document.createElement('div');
    scroller.style.cssText =
      'position:fixed;left:0;top:0;width:100px;height:80px;overflow:scroll;opacity:0;pointer-events:none;';
    const content = document.createElement('div');
    content.style.cssText = 'width:400px;height:300px;';
    scroller.append(content);
    document.body.append(scroller);
    const bar = getComputedStyle(scroller, '::-webkit-scrollbar');
    const thumb = getComputedStyle(scroller, '::-webkit-scrollbar-thumb');
    const track = getComputedStyle(scroller, '::-webkit-scrollbar-track');
    const button = getComputedStyle(scroller, '::-webkit-scrollbar-button');
    scroller.scrollTop = 40;
    scroller.scrollLeft = 50;
    const value = {
      width: bar.width,
      height: bar.height,
      thumb: thumb.backgroundColor,
      track: track.backgroundColor,
      border: thumb.borderTopWidth,
      radius: thumb.borderTopLeftRadius,
      buttons: button.display,
      top: scroller.scrollTop,
      left: scroller.scrollLeft,
      verticalGutter: scroller.offsetWidth - scroller.clientWidth,
      horizontalGutter: scroller.offsetHeight - scroller.clientHeight,
      pixelRatio: window.devicePixelRatio,
    };
    scroller.remove();
    return value;
  });
  assert.equal(sample.width, '12px');
  assert.equal(sample.height, '12px');
  assert.equal(sample.thumb, dark ? 'rgb(142, 147, 166)' : 'rgb(113, 121, 138)');
  assert(Math.abs(parseFloat(sample.border) - 3) <= 1 / sample.pixelRatio + 0.01);
  assert.equal(sample.radius, '8px');
  assert.equal(sample.buttons, 'none');
  assert.equal(sample.top, 40);
  assert.equal(sample.left, 50);
  assert(sample.verticalGutter > 0 && sample.horizontalGutter > 0);
  if (tracks.has(dark)) assert.equal(sample.track, tracks.get(dark));
  else tracks.set(dark, sample.track);
  return sample;
};
