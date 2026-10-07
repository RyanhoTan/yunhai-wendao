import type {WeatherIntent,WeatherSnapshot} from '../systems/WeatherState';

const formatHour=(hour:number)=>{
  const minute=Math.floor((((hour%24)+24)%24)*60+1e-6);
  return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
};
const percent=(value:number)=>`${Math.round(value*100)}%`;

/** A view of WeatherState. Every control emits an intent; simulation owns all values. */
export class WeatherPanel {
  private readonly root:HTMLElement;
  private readonly controls=new Map<string,HTMLElement>();
  private opened=false;
  private returnFocus:HTMLElement|null=null;
  private lastFocus:HTMLElement|null=null;

  constructor(private readonly onIntent:(intent:WeatherIntent)=>void){
    this.root=document.createElement('aside');
    this.root.id='weather-panel';this.root.className='weather-panel';this.root.hidden=true;
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');
    this.root.setAttribute('aria-labelledby','weather-panel-title');this.root.tabIndex=-1;
    this.root.innerHTML=`
      <header class="weather-panel-header"><div><span class="weather-eyebrow">开发预览 · 云岚天象</span><h2 id="weather-panel-title">观天调候</h2></div><button type="button" class="weather-close" data-weather="close" aria-label="关闭天气面板，P 或 Esc 键" title="关闭 [P / Esc]">×</button></header>
      <div class="weather-panel-body">
        <div class="weather-clock"><div><span>世界时刻</span><strong data-weather="clock">12:00</strong></div><div class="weather-clock-meta"><span data-weather="weather-label">多云</span><span data-weather="mode-label">现实同步</span></div></div>
        <p class="weather-timezone">本机时区 <span data-weather="timezone"></span></p>
        <label class="weather-control"><span>昼夜来源</span><select data-weather="time-mode" aria-label="昼夜来源"><option value="real">现实同步</option><option value="manual">手动预览</option></select></label>
        <div class="weather-range"><label for="weather-panel-hour">昼夜时刻 <output data-weather="hour-value" for="weather-panel-hour">12:00</output></label><input id="weather-panel-hour" data-weather="hour" type="range" min="0" max="23.99" step="0.01" value="12" aria-label="昼夜时刻"><div class="weather-range-scale" aria-hidden="true"><span>子夜</span><span>正午</span><span>子夜</span></div></div>
        <p class="weather-hint" data-weather="time-hint">拖动时刻可切换到手动预览。</p>
        <div class="weather-range"><label for="weather-panel-cloud">云量 <output data-weather="cloud-cover-value" for="weather-panel-cloud">42%</output></label><input id="weather-panel-cloud" data-weather="cloud-cover" type="range" min="0" max="1" step="0.01" value="0.42" aria-label="云量"></div>
        <div class="weather-range"><label for="weather-panel-rain">雨量 <output data-weather="rain-value" for="weather-panel-rain">0%</output></label><input id="weather-panel-rain" data-weather="rain" type="range" min="0" max="1" step="0.01" value="0" aria-label="雨量"></div>
        <div class="weather-presets" role="group" aria-label="天气快捷预设"><button type="button" data-weather="preset-clear" aria-pressed="false">晴空</button><button type="button" data-weather="preset-cloudy" aria-pressed="false">阴云</button><button type="button" data-weather="preset-rain" aria-pressed="false">落雨</button></div>
        <label class="weather-random"><span><strong>随机天气</strong><small>每 2–4 分钟自然过渡</small></span><input data-weather="random" type="checkbox" aria-label="随机天气"></label>
        <p class="weather-transition" data-weather="transition" aria-live="off">世界天气由上述滑块控制。</p>
        <p class="weather-hint weather-source-note">随机变化由游戏生成；现实同步只同步昼夜。</p>
      </div>
      <footer class="weather-panel-footer"><span>调候时暂停战斗</span><span><kbd>P</kbd> / <kbd>Esc</kbd> 收起</span></footer>`;
    this.root.querySelectorAll<HTMLElement>('[data-weather]').forEach(el=>this.controls.set(el.dataset.weather!,el));
    this.root.addEventListener('input',this.input);this.root.addEventListener('change',this.change);
    this.root.addEventListener('click',this.click);this.root.addEventListener('keydown',this.keyDown);
    this.root.addEventListener('keyup',this.stop);this.root.addEventListener('contextmenu',this.contextMenu);
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','wheel'])this.root.addEventListener(type,this.stop);
    document.body.appendChild(this.root);
    document.addEventListener('focusin',this.focusInside);
  }

  update(snapshot:WeatherSnapshot,open:boolean){
    this.root.hidden=!open;
    if(open!==this.opened){
      this.opened=open;
      if(open){
        this.returnFocus=document.activeElement instanceof HTMLElement&&document.activeElement!==document.body?document.activeElement:null;
        this.controls.get('time-mode')!.focus({preventScroll:true});
      }else{
        const target=this.returnFocus?.isConnected?this.returnFocus:document.querySelector<HTMLElement>('#game-canvas');
        target?.focus({preventScroll:true});this.returnFocus=null;
      }
    }
    if(!open)return;
    this.text('clock',formatHour(snapshot.hour));this.text('timezone',snapshot.timeZone);
    this.text('weather-label',snapshot.weatherLabel);this.text('mode-label',snapshot.timeMode==='real'?'现实同步':'手动预览');
    this.setValue('time-mode',snapshot.timeMode);this.setValue('hour',snapshot.hour.toFixed(2));
    this.setValue('cloud-cover',snapshot.cloudCover.toFixed(2));this.setValue('rain',snapshot.rain.toFixed(2));
    this.text('hour-value',formatHour(snapshot.hour));this.text('cloud-cover-value',percent(snapshot.cloudCover));this.text('rain-value',percent(snapshot.rain));
    this.controls.get('hour')!.setAttribute('aria-valuetext',formatHour(snapshot.hour));
    this.controls.get('cloud-cover')!.setAttribute('aria-valuetext',percent(snapshot.cloudCover));
    this.controls.get('rain')!.setAttribute('aria-valuetext',percent(snapshot.rain));
    this.text('time-hint',snapshot.timeMode==='real'?'跟随本机现实时间；拖动时刻可手动预览。':'正在预览所选时刻；选择现实同步可恢复。');
    const random=this.controls.get('random') as HTMLInputElement;
    if(random.checked!==snapshot.randomWeather)random.checked=snapshot.randomWeather;
    const transitioning=Math.abs(snapshot.targetCloudCover-snapshot.cloudCover)>.02||Math.abs(snapshot.targetRain-snapshot.rain)>.02;
    this.root.dataset.transitioning=String(transitioning&&snapshot.randomWeather);
    this.text('transition',snapshot.randomWeather?
      `${transitioning?'正在过渡':'当前稳定'} · 目标云量 ${percent(snapshot.targetCloudCover)} / 雨量 ${percent(snapshot.targetRain)} · ${Math.ceil(snapshot.nextChange)} 秒后换候`:
      '手动调节云量、雨量或预设会关闭随机天气。');
    const selected=snapshot.randomWeather?'':snapshot.rain>.08?'rain':snapshot.cloudCover>.65?'cloudy':snapshot.cloudCover<.3?'clear':'';
    for(const preset of ['clear','cloudy','rain'])this.controls.get(`preset-${preset}`)!.setAttribute('aria-pressed',String(selected===preset));
  }

  private text(name:string,value:string){const el=this.controls.get(name)!;if(el.textContent!==value)el.textContent=value;}
  private setValue(name:string,value:string){
    const el=this.controls.get(name) as HTMLInputElement|HTMLSelectElement;
    if(el.value!==value)el.value=value;
  }
  private input=(event:Event)=>{
    event.stopPropagation();const target=event.target;
    if(!(target instanceof HTMLInputElement)||target.type!=='range')return;
    const value=target.valueAsNumber;
    switch(target.dataset.weather){
      case 'hour':this.onIntent({type:'hour',value});break;
      case 'cloud-cover':this.onIntent({type:'cloud-cover',value});break;
      case 'rain':this.onIntent({type:'rain',value});break;
    }
  };
  private change=(event:Event)=>{
    event.stopPropagation();const target=event.target;
    if(target instanceof HTMLSelectElement&&target.dataset.weather==='time-mode'){
      if(target.value==='real'||target.value==='manual')this.onIntent({type:'time-mode',value:target.value});
    }else if(target instanceof HTMLInputElement&&target.dataset.weather==='random')this.onIntent({type:'random',value:target.checked});
  };
  private click=(event:MouseEvent)=>{
    event.stopPropagation();const target=event.target instanceof Element?event.target.closest<HTMLElement>('[data-weather]'):null;
    switch(target?.dataset.weather){
      case 'close':this.onIntent({type:'close'});break;
      case 'preset-clear':this.onIntent({type:'preset',value:'clear'});break;
      case 'preset-cloudy':this.onIntent({type:'preset',value:'cloudy'});break;
      case 'preset-rain':this.onIntent({type:'preset',value:'rain'});break;
    }
  };
  private keyDown=(event:KeyboardEvent)=>{
    event.stopPropagation();
    if(event.code==='Escape'||event.code==='KeyP'){event.preventDefault();if(!event.repeat)this.onIntent({type:'close'});return;}
    if(event.key!=='Tab')return;
    const focusable=Array.from(this.root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===this.root)){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===this.root)){event.preventDefault();first?.focus();}
  };
  private stop=(event:Event)=>event.stopPropagation();
  private focusInside=(event:FocusEvent)=>{
    if(!this.opened)return;const target=event.target;
    if(target instanceof HTMLElement&&this.root.contains(target))this.lastFocus=target;
    else (this.lastFocus?.isConnected?this.lastFocus:this.controls.get('time-mode'))?.focus({preventScroll:true});
  };
  private contextMenu=(event:Event)=>{event.preventDefault();event.stopPropagation();};
  dispose(){
    document.removeEventListener('focusin',this.focusInside);
    if(this.opened){const target=this.returnFocus?.isConnected?this.returnFocus:document.querySelector<HTMLElement>('#game-canvas');target?.focus({preventScroll:true});}
    this.root.remove();this.controls.clear();this.returnFocus=null;this.opened=false;
  }
}
