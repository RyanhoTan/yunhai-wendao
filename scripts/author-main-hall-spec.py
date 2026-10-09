"""Refine the skill's seeded sculpt spec from the supplied three-elevation reference."""
import copy
import json
from pathlib import Path

folder = Path(__file__).resolve().parents[1] / 'artifacts/main-hall-20261009'
path = folder / 'sculpt-spec.json'
spec = json.loads(path.read_text())
spec['suitability'] = 'pass'
spec['scores'] = dict(object_isolation=3, silhouette_readability=3, depth_inference=3,
                      primitive_decomposition=3, material_procedurality=2, occlusion_risk=1, interaction_fit=3)
a = spec['preSpecAssessment']
a['objectClass'].update(primaryType='two-tier Chinese main hall', primaryDomain='object',
    formLanguage=['architectural', 'hard-surface'], structureKind=['layered shell', 'repeated modules'],
    motionPotential=['static prop', 'detachable'], materialFamilies=['ceramic', 'wood', 'stone', 'metal', 'plaster'],
    notes='Three supplied elevations; interior is inferred for gameplay.')
a['complexity']['reasoning'] = ['Two curved hip roofs, repeated rolls, dense lattice and bracket assemblies.']
a['specDepthDecision'].update(requiredDepth='complex', minimumComponentLevels=['macro','meso','micro'],
    needsRepetitionSystems=True, needsMaterialLocalOverrides=True, rationale='Three assemblies with repeated structural and geometric details.')
a['unknownsToResolveBeforeImplementation'] = []
spec['qualityContract']['definitionOfDone'] = [
    'Low, wide 25.8m lower hip roof and 16.4m upper hip roof with four curled corners on each tier.',
    'Vermilion columns, ivory infill, front lattice doors, rear windows, stepped masonry and central open entrance.',
    'Named selectable/explodable semantic parts and aligned gameplay collision; browser evidence from all sides.']
spec['qualityTargets']['reviewViewpoints'] = ['front','right','rear','left','three-quarter']
spec['performanceBudget'].update(targetTriangles=90000, maxDrawCalls=65, textureSize=1024, fpsTarget=60)
spec['referenceCamera'].update(solved=True, aspect=794/469, positionHint=[0,8,55], note='Near-orthographic elevations; camera target y=8. Use supplied front crop.')
spec['silhouette'].update(boundingShape='27m wide by 16m high stepped hall', symmetry='bilateral X/Z roofs',
    aspectRatios=[{'axis':'width/height','value':1.7}], dominantCurves=['concave eaves with corner lift'],
    negativeSpaces=['central 2.6m entry'], landmarks=['stone plinth','lower eaves','upper loft','gold finial'])
base = copy.deepcopy(spec['componentTree'][0])
base['actionProfile']['sockets']=[]
material = copy.deepcopy(spec['materials'][0])
defs = [
 ('foundation','macro',[27,1.3,20],[0,.65,0],'stone'),
 ('stairs','meso',[7.6,1.3,5],[0,.6,11.5],'stone'),
 ('railings','meso',[25,1.2,18],[0,1.3,0],'stone'),
 ('columns','meso',[20.4,5.3,12.6],[0,3.95,0],'wood'),
 ('beams','meso',[21.5,.8,13.2],[0,6.15,0],'wood'),
 ('lower-roof','macro',[25.8,3.1,18.8],[0,6.8,0],'roof'),
 ('lower-tiles','micro',[25.8,3.1,18.8],[0,6.9,0],'roof'),
 ('lower-eaves','meso',[25.8,1.2,18.8],[0,6.8,0],'roof'),
 ('brackets','meso',[22,1.1,14.2],[0,6.4,0],'wood'),
 ('facades','meso',[20.4,4.6,11.8],[0,3.9,0],'ivory'),
 ('front-doors','meso',[18.8,4.4,.22],[0,3.6,5.92],'wood'),
 ('rear-windows','meso',[20,3.6,.22],[0,3.8,-5.92],'wood'),
 ('upper-walls','meso',[11.3,2.4,7.4],[0,10.45,0],'ivory'),
 ('upper-columns','meso',[11.3,2.5,7.4],[0,10.5,0],'wood'),
 ('upper-roof','macro',[16.4,3.2,11.6],[0,11.65,0],'roof'),
 ('upper-tiles','micro',[16.4,3.2,11.6],[0,11.75,0],'roof'),
 ('ornaments','micro',[25.8,9.1,18.8],[0,10.6,0],'gold'),
 ('plaque','meso',[4.8,1.15,.2],[0,5.85,6.7],'gold'),
]
features = {
 'foundation':['staggered-stone-joints','carved-stone-insets'], 'stairs':['wide-shallow-treads'],
 'railings':['stone-balusters','vermilion-top-rails'], 'columns':['round-red-shafts','stone-column-bases'],
 'beams':['teal-beam-inlays','gold-beam-lines'], 'lower-roof':['curved-four-slope-skirt'],
 'lower-tiles':['dense-roof-rolls','circular-tile-endcaps'], 'lower-eaves':['thick-eave-fascia'],
 'brackets':['tiered-dougong-cantilevers'], 'front-doors':['vertical-lattice','horizontal-lattice','door-rail-panels'],
 'rear-windows':['rear-wall-window-rhythm'], 'upper-walls':['upper-ivory-infill','skirt-roof-join'],
 'upper-columns':['upper-vermilion-posts'], 'upper-roof':['hip-ridge-corner-curl'],
 'upper-tiles':['upper-tile-courses'], 'ornaments':['gold-corner-caps','stacked-finial'],
 'plaque':['gold-inscription','double-gold-frame']}
components=[copy.deepcopy(base)]
components[0].update(id='root', name='MainHall',material='stone',materialLayers=['stone'], dimensions=dict(width=27,height=16,depth=25,units='metres',confidence=.85))
for id,level,dims,pos,mat in defs:
 c=copy.deepcopy(base)
 c.update(id=id,name=id,parent='root',level=level,role='body',confidence=.86,material=mat,materialLayers=[mat],
    dimensions=dict(zip(['width','height','depth'],dims),units='metres',confidence=.86),
    transform=dict(position=pos,rotation=[0,0,0],scale=[1,1,1]),
    topologyRationale='Rigid assembly of independently placed architectural solids with measurable thickness.',
    localFeatures=[{'id':f,'type':'geometry','evidenceRefs':['full-object'],'description':f.replace('-',' ')} for f in features.get(id,[])])
 c['actionProfile']['destruction']['fractureGroup']=id
 c['actionProfile']['collider']['notes']='Runtime uses compound gameplay proxies; ornamental detail follows structural parent.'
 if id in ('lower-roof','upper-roof'):
  c.update(primitive='extrude',topologyClass='conforming-shell',topologyRationale='Thin curved four-slope roof with a connected underside and fascia.')
  c['geometryDescriptor'].update(profile={'points':[[-.5,0],[0,.2],[.5,0]],'depth':1},
      architecturalRoof={'halfWidth':dims[0]/2,'halfDepth':dims[2]/2,'rise':dims[1],
                         'radialRows':10,'columns':24,'slopePower':1.7,'cornerLift':.86 if id=='upper-roof' else .88,
                         'ridgeHalfLength':.12 if id=='upper-roof' else 5.65,'innerDepth':0 if id=='upper-roof' else 3.7})
 if id=='stairs':
  c['geometryDescriptor']['stairs']={'count':8,'startZ':13.5,'spacing':.69,'depth':.84,'rise':.1625,'width':7.6,'walkingSurface':'highest visible tread or overlapping terrace'}
 c['fidelityTier']='game-ready'
 components.append(c)
spec['componentTree']=components
spec['viewEvidence']=[{'id':'full-object','sourceImage':str(folder/'reference.png'),'confidence':.9,
 'imageRegion':{'x':0,'y':0,'width':2115,'height':743},'notes':'Front, right and rear elevations.'}]
mats=[]
for id,color,rough,metal in [('stone','#aaa9a0',.94,0),('wood','#853d2d',.6,0),('roof','#275e5b',.4,0),('ivory','#e5d7b9',.9,0),('gold','#c4a15c',.34,.72)]:
 m=copy.deepcopy(material)
 m.update(id=id,name=id,color=color,baseColor=color,textureResolution=1024,
   albedo={'dominant':color,'secondary':[color],'samplingNotes':'Palette inferred from the illustrated elevations, not inverse-rendered PBR.'},
   colorVariation={'palette':[color],'pattern':'subtle-grain','amplitude':.03,'heightCorrelation':0},
   roughness={'base':rough,'variation':.04},metalness={'base':metal,'variation':0},
   localOverrides=[{'id':id+'-cavity','pattern':'joint-relief','roughnessOffset':.04,'evidenceRefs':['full-object']}],
   notes='Illustrated source has no recoverable physical PBR channels; scalars are explicit approximation, structural relief is geometry.')
 mats.append(m)
spec['materials']=mats
palettes={m['id']:m['color'] for m in mats}
palettes['base']='#aaa9a0'
for c in components:
 col=palettes[c['material']]
 rgb=[int(col[i:i+2],16) for i in (1,3,5)]
 rgba='rgba(%d, %d, %d, 1)' % tuple(rgb)
 c['colorMaterialRecipe']=dict(dominantAlbedo=rgba,secondaryAlbedo=rgba,
   materialClass='metal' if c['material']=='gold' else 'ceramic' if c['material']=='roof' else 'wood' if c['material']=='wood' else 'stone',materialClassConfidence=.85)
 if c['parent']:
  p=c['transform']['position']
  c['attachment']=dict(parentId='root',parentSocket=c['id']+'-anchor',localStart=p,
      localEnd=[p[0],p[1]+.1,p[2]],contactType='overlap',overlap=.04,gapTolerance=.02,evidenceRefs=['full-object'])
  components[0]['actionProfile']['sockets'].append(dict(id=c['id']+'-anchor',position=p,rotation=[0,0,0],purpose='assembly'))
spec['lightingFromPhoto']=[dict(id='key',type='directional',direction=[-1,2,3],color='#fff4df',intensity=3),dict(id='fill',type='hemisphere',color='#d8ebf1',intensity=1.4),dict(id='renderer',exposure=1.05,toneMapping='ACES filmic',shadow='soft contact shadow')]
spec['lookDevTargets']['qualityPriority']='game-ready-procedural'
spec['qualityContract']['featureGroups'][4]['qualityCriteria']=['Palette inferred from visible solid paint; neutral and game lighting checked. Illustrated reference cannot recover measured physical PBR channels.']
spec['repetitionSystems']=[{'id':id,'componentRefs':[ref],'distribution':d,'count':count,'evidenceRefs':['full-object']}
 for id,ref,d,count in [('tile-rolls','lower-tiles','four-slope parallel rolls at .23m spacing',230),('lattice-bars','front-doors','uniform .15m bar spacing inside each frame',180),('dougong','brackets','two-stage supports at column tops',26)]]
details=[]
for c in components:
 for f in c['localFeatures']:
  details.append({'id':f['id'],'name':f['id'],'zone':c['id'],'importance':'important','evidenceRefs':['full-object'],
   'mapsTo':{'component':c['id'],'localFeature':f['id']},'confidence':.85})
for d in details:
 d['kind']='ridge' if 'tile' in d['id'] else 'linework'
 d['mapsTo']={'ref':d['mapsTo']['localFeature']}
a['detailInventory'].update(targetMinDetails=12,details=details)
spec['featureReviewTargets']=[
 {'id':id,'name':name,'tier':'critical','passIds':passes,'minimumScore':.75,'mustPass':True,'componentRefs':refs,'evidenceRefs':['full-object']}
 for id,name,passes,refs in [
 ('two-tier-hip-roofs','Wide double hip roofs and loft proportions',['blockout','form-refinement'],['lower-roof','upper-roof','upper-walls']),
 ('red-post-structure','Red post-and-beam hierarchy',['structural-pass'],['columns','beams','facades']),
 ('architectural-detail','Dense rolls, dougong and lattice',['form-refinement','surface-pass'],['lower-tiles','brackets','front-doors']),
 ('celadon-vermilion-stone','Celadon ceramic, red timber and grey stone',['material-pass','lighting-pass'],['lower-roof','columns','foundation']),
 ('walkable-assembly','Entry and named architectural assemblies',['interaction-pass','optimization-pass'],['stairs','front-doors','railings'])]]
for p in spec['buildPasses']:
 p['componentRefs']=[c['id'] for c in components]
 if p['id']=='material-pass':
  p['acceptance']=['Solid-paint palette and independent subtle stone height; PBR scalars explicitly inferred from illustration.','AI vision score >= .7.']
spec['assumptions']=['Dimensions adapt to the existing 27m summit plinth. Interior is gameplay inference. Painted micro motifs are approximate.']
spec['proceduralStrategy']=['Four continuous hip-roof surfaces sampled from concave radial profiles.', 'Tube rolls, eave rims and geometric lattice follow actual 3D surfaces.', 'Batch per semantic assembly/material; preserve part picking and sockets.']
path.write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n')
(folder/'assessment.json').write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n')
print(path)
