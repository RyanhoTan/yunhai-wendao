export type TimeMode='real'|'manual';
export type WeatherPreset='clear'|'cloudy'|'rain';
export type WeatherIntent=
  |{type:'time-mode';value:TimeMode}|{type:'hour';value:number}
  |{type:'cloud-cover'|'rain';value:number}|{type:'random';value:boolean}
  |{type:'preset';value:WeatherPreset}|{type:'close'};
export interface WeatherPreferences {timeMode:TimeMode;manualHour:number;cloudCover:number;rain:number;randomWeather:boolean}
export interface WeatherSnapshot extends WeatherPreferences {
  hour:number;timeZone:string;nextChange:number;weatherClock:number;
  targetCloudCover:number;targetRain:number;weatherLabel:string;
}
export const WEATHER_DEFAULTS:WeatherPreferences={timeMode:'real',manualHour:12,cloudCover:.42,rain:0,randomWeather:false};
const presets:Record<WeatherPreset,{cloudCover:number;rain:number}>={
  clear:{cloudCover:.22,rain:0},cloudy:{cloudCover:.8,rain:0},rain:{cloudCover:.94,rain:.75},
};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const hour=(n:number)=>((n%24)+24)%24;

/** Local wall clock is independent of game speed, hitstop, save data and random weather. */
export class WeatherState {
  private prefs:WeatherPreferences={...WEATHER_DEFAULTS};
  private cloud=.42;private rainfall=0;private countdown=0;private clock=0;private observedHour=12;
  private readonly timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  constructor(private now:()=>Date=()=>new Date(),private random:()=>number=Math.random){this.update(0);}
  restore(value:unknown){
    this.prefs={...WEATHER_DEFAULTS};
    if(value&&typeof value==='object'){
      const p=value as Record<string,unknown>;
      if(p.timeMode==='real'||p.timeMode==='manual')this.prefs.timeMode=p.timeMode;
      if(typeof p.manualHour==='number'&&Number.isFinite(p.manualHour))this.prefs.manualHour=hour(p.manualHour);
      if(typeof p.cloudCover==='number'&&Number.isFinite(p.cloudCover))this.prefs.cloudCover=clamp(p.cloudCover);
      if(typeof p.rain==='number'&&Number.isFinite(p.rain))this.prefs.rain=clamp(p.rain);
      if(typeof p.randomWeather==='boolean')this.prefs.randomWeather=p.randomWeather;
    }
    this.cloud=this.prefs.cloudCover;this.rainfall=this.prefs.rain;this.countdown=this.prefs.randomWeather?120:0;this.clock=0;this.update(0);
  }
  apply(intent:WeatherIntent){
    if(intent.type==='hour'&&Number.isFinite(intent.value)){this.prefs.manualHour=hour(intent.value);this.prefs.timeMode='manual';}
    else if(intent.type==='time-mode'){this.prefs.timeMode=intent.value;}
    else if((intent.type==='cloud-cover'||intent.type==='rain')&&Number.isFinite(intent.value)){
      this.prefs.randomWeather=false;this.countdown=0;
      if(intent.type==='cloud-cover')this.prefs.cloudCover=this.cloud=clamp(intent.value);
      else this.prefs.rain=this.rainfall=clamp(intent.value);
    }
    else if(intent.type==='preset'){this.prefs.randomWeather=false;this.countdown=0;Object.assign(this.prefs,presets[intent.value]);this.cloud=this.prefs.cloudCover;this.rainfall=this.prefs.rain;}
    else if(intent.type==='random'){this.prefs.randomWeather=intent.value;if(intent.value)this.chooseWeather();else{this.prefs.cloudCover=this.cloud;this.prefs.rain=this.rainfall;this.countdown=0;}}
    this.update(0);
  }
  private chooseWeather(){const index=Math.min(2,Math.floor(clamp(this.random())*3));Object.assign(this.prefs,presets[(['clear','cloudy','rain'] as const)[index]]);this.countdown=120+clamp(this.random())*120;}
  update(dt:number){
    const seconds=Number.isFinite(dt)?Math.max(0,dt):0;
    this.clock+=seconds;
    if(this.prefs.randomWeather){this.countdown-=seconds;if(this.countdown<=0)this.chooseWeather();}
    const mix=1-Math.exp(-seconds/8);
    this.cloud+=(this.prefs.cloudCover-this.cloud)*mix;this.rainfall+=(this.prefs.rain-this.rainfall)*mix;
    const date=this.now();this.observedHour=this.prefs.timeMode==='real'?date.getHours()+date.getMinutes()/60+date.getSeconds()/3600:this.prefs.manualHour;
  }
  preferences():WeatherPreferences{return {...this.prefs};}
  snapshot():WeatherSnapshot{return {...this.prefs,hour:this.observedHour,cloudCover:this.cloud,rain:this.rainfall,
    timeZone:this.timeZone,nextChange:this.countdown,weatherClock:this.clock,
    targetCloudCover:this.prefs.cloudCover,targetRain:this.prefs.rain,
    weatherLabel:this.rainfall>.08?'雨':this.cloud>.65?'阴':this.cloud>.3?'多云':'晴'};}
}
