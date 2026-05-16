import csv,json,os,re
CSV=os.path.join(os.path.dirname(__file__),'..','planejamento','Efetivo.csv')
OUT=os.path.join(os.path.dirname(__file__),'data.js')
workers=[];mil_id=0;civ_id=0;section='militar'
with open(CSV,'r',encoding='utf-8-sig') as f:
    for row in csv.reader(f):
        if len(row)<4 or not row[0].strip():continue
        seq=row[0].strip()
        if seq=='SEQ':section='militar';continue
        if seq=='Nº':section='civil';continue
        if not seq.isdigit():continue
        nome=row[1].strip();posto=row[2].strip()
        funcao=' '.join(row[3].strip().split())
        servico=' '.join(row[4].strip().split()) if len(row)>4 else ''
        if section=='militar':
            mil_id+=1
            m=re.match(r'\(([^)]+)\)',nome)
            guerra=m.group(1) if m else nome
            nc=re.sub(r'\([^)]+\)\s*','',nome).strip() if m else nome
            workers.append({'id':f'mil-{mil_id:02d}','nome':guerra,'nomeCompleto':nc,
                'tipo':'militar','subtipo':'militar','posto':posto,'funcao':funcao,'servico':servico})
        else:
            civ_id+=1
            st='civil-be' if 'SPTF-BE' in posto else 'civil-ko'
            workers.append({'id':f'civ-{civ_id:03d}','nome':nome.title().strip(),
                'nomeCompleto':nome.title().strip(),'tipo':'civil','subtipo':st,
                'posto':posto,'funcao':funcao,'servico':''})

teams=[
  {"id":"cdc","nome":"CDC (Dosadora)","cor":"#3b82f6","subgrupos":[
    {"nome":"Operação CDC","slots":[
      {"funcao":"Operador CDC","qtd":1},{"funcao":"Operador Pá de Garfo","qtd":1},
      {"funcao":"Operador Pá Carregadeira","qtd":1},{"funcao":"Eletricista de Auto","qtd":2},
      {"funcao":"Encanador / Hidráulica","qtd":1},{"funcao":"Auxiliar de Laboratório","qtd":2},
      {"funcao":"Motorista Betoneira","qtd":3},{"funcao":"Rasga Saco","qtd":4}]}]},
  {"id":"concretagem","nome":"Concretagem","cor":"#6366f1","subgrupos":[
    {"nome":"Frente Viana","slots":[
      {"funcao":"Encarregado","qtd":1},{"funcao":"Laboratorista (Controle Tecnológico)","qtd":1},
      {"funcao":"Operador (recebimento)","qtd":1},{"funcao":"Enxada (espalhamento)","qtd":4},
      {"funcao":"Vibrador","qtd":2},{"funcao":"Régua (nivelamento)","qtd":2},
      {"funcao":"Colher (acabamento primário)","qtd":1},{"funcao":"Acabamento fino (colher)","qtd":3},
      {"funcao":"Curing","qtd":1},{"funcao":"Vassoura (texturização)","qtd":1},
      {"funcao":"Ferragem / Graxa","qtd":1}]}]},
  {"id":"reciclagem","nome":"Reciclagem","cor":"#22c55e","subgrupos":[
    {"nome":"Equipe de Reciclagem","slots":[
      {"funcao":"Encarregado / Laboratorista","qtd":1},{"funcao":"Auxiliar de Laboratório","qtd":1},
      {"funcao":"Operador Recicladora","qtd":1},{"funcao":"Operador Patrol (Motoniveladora)","qtd":1},
      {"funcao":"Operador Rolo Pé de Carneiro","qtd":1},{"funcao":"Operador Escavadeira","qtd":1},
      {"funcao":"Operador Trator de Esteira","qtd":1},{"funcao":"Operador de Apoio","qtd":3},
      {"funcao":"Motorista Caçamba","qtd":3},{"funcao":"Servente","qtd":1}]}]},
  {"id":"trilhos-rasga","nome":"Trilhos + Rasga Saco","cor":"#14b8a6","subgrupos":[
    {"nome":"Equipe de Trilhos e Rasga Saco","slots":[
      {"funcao":"Encarregado","qtd":1},{"funcao":"Rasga Saco","qtd":10},{"funcao":"Servente","qtd":4}]}]},
  {"id":"canaletas","nome":"Canaletas","cor":"#f97316","subgrupos":[
    {"nome":"Turno ALFA (07h–12h)","slots":[
      {"funcao":"Pedreiro","qtd":3},{"funcao":"Servente","qtd":10},
      {"funcao":"Ferreiro","qtd":1},{"funcao":"Operador","qtd":1}]},
    {"nome":"Turno BRAVO (13h–18h30)","slots":[
      {"funcao":"Pedreiro","qtd":2},{"funcao":"Servente","qtd":10},{"funcao":"Operador","qtd":1}]},
    {"nome":"Movimentação","slots":[{"funcao":"Servente (movimentação)","qtd":4}]},
    {"nome":"Recuperação","slots":[{"funcao":"Pedreiro (recuperação)","qtd":1},{"funcao":"Servente (recuperação)","qtd":2}]}]},
  {"id":"topografia","nome":"Topografia","cor":"#a855f7","subgrupos":[
    {"nome":"Equipe de Topografia","slots":[
      {"funcao":"Topógrafo","qtd":2},{"funcao":"Auxiliar de Topografia","qtd":4}]}]},
  {"id":"trincheira","nome":"Trincheira Drenante","cor":"#eab308","subgrupos":[
    {"nome":"Equipe Trincheira","slots":[
      {"funcao":"Encarregado","qtd":1},{"funcao":"Operador","qtd":1},{"funcao":"Servente","qtd":6}]}]},
  {"id":"corte-selagem","nome":"Corte e Selagem","cor":"#f59e0b","subgrupos":[
    {"nome":"Equipe Corte e Selagem","slots":[
      {"funcao":"Encarregado","qtd":1},{"funcao":"Operador de Corte","qtd":2},{"funcao":"Servente","qtd":4}]}]},
  {"id":"manutencao","nome":"Manutenção","cor":"#ef4444","subgrupos":[
    {"nome":"Equipe de Manutenção","slots":[
      {"funcao":"Supervisor de Manutenção","qtd":1},{"funcao":"Torneiro Mecânico","qtd":1},
      {"funcao":"Mecânico Geral","qtd":1},{"funcao":"Mecânico Motor Diesel","qtd":1},
      {"funcao":"Mecânico de Máquinas","qtd":1},{"funcao":"Auxiliar Mecânico","qtd":2},
      {"funcao":"Soldador","qtd":1},{"funcao":"Lubrificador","qtd":1},{"funcao":"Borracheiro","qtd":1}]}]},
  {"id":"apoio","nome":"Apoio / Logística","cor":"#06b6d4","subgrupos":[
    {"nome":"Suprimentos","slots":[{"funcao":"Almoxarife","qtd":1},{"funcao":"Aux. Suprimentos","qtd":1}]},
    {"nome":"Combustíveis","slots":[{"funcao":"Enc. Comb Lub","qtd":1},{"funcao":"Aux. Comb Lub","qtd":1}]},
    {"nome":"Rancho","slots":[{"funcao":"Cozinheiro","qtd":4},{"funcao":"Aux. Cozinha","qtd":1}]},
    {"nome":"Segurança","slots":[{"funcao":"Chefe da Guarda","qtd":1},{"funcao":"Guarda","qtd":4}]},
    {"nome":"Administrativo / Saúde","slots":[
      {"funcao":"Administrativo","qtd":1},{"funcao":"Enfermeiro","qtd":1},
      {"funcao":"Téc. Seg. Trabalho","qtd":1},{"funcao":"Aux. Administrativo","qtd":1}]}]},
  {"id":"comando","nome":"Comando e Engenharia","cor":"#d97706","subgrupos":[
    {"nome":"Comando","slots":[
      {"funcao":"Chefe do Destacamento","qtd":1},{"funcao":"Engenheiro Planejador","qtd":1},
      {"funcao":"Engenheiro de Produção","qtd":1},{"funcao":"Engenheiro Mecânico / Logística","qtd":1},
      {"funcao":"Elo Engenharia–Manutenção","qtd":1}]}]},
  {"id":"motoristas","nome":"Motoristas (Pool)","cor":"#ec4899","subgrupos":[
    {"nome":"Pool de Motoristas","slots":[{"funcao":"Motorista","qtd":7},{"funcao":"Carpinteiro (apoio)","qtd":2}]}]}
]

# Expand slots
for t in teams:
    for sg in t['subgrupos']:
        exp=[]
        for s in sg['slots']:
            for i in range(s['qtd']):
                lb=f"{s['funcao']} #{i+1}" if s['qtd']>1 else s['funcao']
                exp.append({"funcao":s['funcao'],"label":lb,"worker":None})
        sg['slots']=exp

# Default state - pre-filled allocations
DS={
  "comando":{"0":{0:"mil-01",1:"mil-04",2:"mil-02",3:"mil-03",4:"mil-12"}},
  "cdc":{"0":{0:"civ-014",1:"civ-031",2:"civ-102",3:"civ-077",4:"civ-106",
    5:"civ-058",6:"civ-073",7:"civ-083",8:"civ-078",9:"civ-047",10:"civ-079",
    11:"civ-005",12:"civ-026",13:"civ-081",14:"civ-022"}},
  "concretagem":{"0":{0:"mil-08",1:"mil-16",2:"civ-061",3:"civ-015",4:"civ-002",
    5:"civ-083",6:"civ-072",7:"civ-065",8:"civ-090",9:"civ-099",10:"civ-066",
    11:"civ-052",12:"civ-043",13:"civ-051",14:"civ-004",15:"civ-085",16:"civ-070",17:"civ-056"}},
  "reciclagem":{"0":{0:"mil-15",2:"civ-107",3:"civ-074",4:"civ-024",5:"mil-22",
    6:"civ-036",7:"civ-035",8:"civ-046",9:"civ-067",10:"civ-091",11:"civ-064",13:"civ-049"}},
  "trilhos-rasga":{"0":{0:"mil-05",1:"civ-050",2:"civ-021",3:"civ-087",4:"civ-045",
    5:"civ-017",6:"civ-055",7:"civ-089",8:"civ-013",9:"civ-037",10:"civ-019"}},
  "topografia":{"0":{0:"mil-05",1:"mil-10",2:"civ-048",3:"civ-068",4:"civ-092",5:"civ-012"}},
  "trincheira":{"0":{0:"mil-10"}},
  "corte-selagem":{"0":{0:"mil-10"}},
  "manutencao":{"0":{0:"mil-07",1:"mil-27",2:"civ-014",3:"civ-069",4:"civ-105",
    5:"civ-034",6:"civ-101",7:"civ-030",8:"civ-088",9:"civ-110"}},
  "apoio":{"0":{0:"mil-06",1:"mil-25"},"1":{0:"mil-14",1:"mil-26"},
    "2":{0:"mil-11",1:"mil-17",2:"civ-032",3:"civ-071",4:"civ-075"},
    "3":{0:"mil-18",1:"mil-19",2:"mil-20",3:"mil-21",4:"mil-31"},
    "4":{0:"mil-09",1:"mil-13",2:"civ-041",3:"civ-109"}},
  "motoristas":{"0":{0:"mil-23",1:"mil-24",2:"mil-28",3:"mil-29",4:"mil-30",
    5:"civ-009",6:"civ-108",7:"civ-006",8:"civ-104"}}
}

js=f"// Auto-generated | {len(workers)} trabalhadores ({mil_id} mil + {civ_id} civ)\n\n"
js+=f"const WORKERS = {json.dumps(workers,ensure_ascii=False)};\n\n"
js+=f"const TEAMS = {json.dumps(teams,ensure_ascii=False)};\n\n"
js+=f"const DEFAULT_STATE = {json.dumps(DS,ensure_ascii=False)};\n"

with open(OUT,'w',encoding='utf-8') as f: f.write(js)
print(f"OK: {len(workers)} workers, {len(teams)} teams, {sum(len(s['slots']) for t in teams for s in t['subgrupos'])} slots")
