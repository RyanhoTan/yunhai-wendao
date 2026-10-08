import './styles.css';
import './elemental.css';
import './weather.css';
import { Game } from './game/Game';
import { loadCultivatorAssets } from './assets/Cultivator';
import {loadEmotiveMoonTexture} from './assets/EmotiveMoon';
import { loadCreatureAssets } from './assets/CreatureModels';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const loading=document.createElement('div');loading.className='character-loading';loading.setAttribute('role','status');
loading.innerHTML='<h1>云海问道</h1><p>正在准备游戏资源…</p>';document.querySelector('#app')!.append(loading);
let game:Game|undefined,disposed=false;
window.addEventListener('pagehide',event=>{if(!event.persisted)disposed=true;});
const ready=Promise.all([loadCultivatorAssets(),loadEmotiveMoonTexture(),loadCreatureAssets()]).then(([,moonTexture])=>{
  if(disposed){moonTexture.dispose();return;}
  game=new Game(canvas,moonTexture);game.start();loading.remove();
});
if(import.meta.env.DEV||new URLSearchParams(location.search).has('test')){
  // Calls made while loading acknowledge only after the actual game and assets are ready.
  const invoke=async <K extends keyof ThreeGameTestHooks>(key:K,value:Parameters<ThreeGameTestHooks[K]>[0])=>{
    await ready;if(disposed)throw new Error('游戏已重新加载');const hooks=window.__THREE_GAME_TEST_HOOKS__!;
    return (hooks[key] as (argument:typeof value)=>ReturnType<ThreeGameTestHooks[K]>)(value);
  };
  window.__THREE_GAME_TEST_HOOKS__={advanceWeather:async v=>{await invoke('advanceWeather',v);},seed:async v=>{await invoke('seed',v);},setState:async v=>await invoke('setState',v) as {state:string},setPausedForScreenshot:async v=>{await invoke('setPausedForScreenshot',v);},setReducedMotion:async v=>{await invoke('setReducedMotion',v);},hideDebugUi:async v=>{await invoke('hideDebugUi',v);}};
}
void ready.catch(error=>{
  if(disposed)return;
  console.error(error);loading.replaceChildren();const text=document.createElement('p');text.textContent='游戏资源未能加载，请重试。';const button=document.createElement('button');button.textContent='重新加载';button.onclick=()=>location.reload();loading.append(text,button);
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposed=true;game?.dispose();loading.remove();
  });
}
