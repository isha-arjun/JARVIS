export type Distribution =
  | { type: "fixed"; value: number }
  | { type: "uniform"; min: number; max: number }
  | { type: "normal"; mean: number; sd: number }
  | { type: "triangular"; min: number; mode: number; max: number }
  | { type: "bernoulli"; probability: number; whenTrue: number; whenFalse: number };
export type VariableSpec = { name: string; distribution: Distribution };
export type ModelSpec = { name: string; formula: string; variables: VariableSpec[]; trials: number };
export type ModelResult = { name: string; formula: string; trials: number; mean: number; median: number; p05: number; p25: number; p75: number; p95: number; probabilityPositive: number; probabilityNegative: number; min: number; max: number; samples: number[]; sensitivity: { name: string; correlation: number }[] };
const FUNCTIONS: Record<string, (...x: number[]) => number> = {
  abs: Math.abs, sqrt: Math.sqrt, log: Math.log, exp: Math.exp,
  min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, pow: Math.pow
};
type Token = { kind: "number" | "name" | "op" | "eof"; value: string };
function tokenize(source: string): Token[] {
  const tokens: Token[] = []; let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (num) { tokens.push({kind:"number",value:num[0]}); i += num[0].length; continue; }
    const name = source.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (name) { tokens.push({kind:"name",value:name[0]}); i += name[0].length; continue; }
    if ("+-*/^(),".includes(c)) { tokens.push({kind:"op",value:c}); i++; continue; }
    throw new Error("Unsupported character in formula: " + c);
  }
  tokens.push({kind:"eof",value:""}); return tokens;
}
export function evaluateFormula(formula: string, vars: Record<string, number>): number {
  // Accept model-style assignments such as "conversions = clicks * rate",
  // but evaluate only the right-hand arithmetic expression.
  const expressionSource = formula.trim().replace(/^[a-zA-Z_][a-zA-Z0-9_]*\\s*=\\s*(?!=)/, "");
  if (!expressionSource.trim()) throw new Error("The formula is empty.");
  const tokens = tokenize(expressionSource); let pos = 0;
  const peek = () => tokens[pos]; const take = () => tokens[pos++];
  function primary(): number {
    const t = take();
    if (t.kind === "number") return Number(t.value);
    if (t.kind === "op" && t.value === "-") return -primary();
    if (t.kind === "op" && t.value === "+") return primary();
    if (t.kind === "op" && t.value === "(") { const v = expression(); if (take().value !== ")") throw new Error("Missing closing parenthesis."); return v; }
    if (t.kind === "name") {
      if (peek().value === "(") {
        take(); const args:number[]=[];
        if (peek().value !== ")") { do { args.push(expression()); if (peek().value !== ",") break; take(); } while(true); }
        if (take().value !== ")") throw new Error("Missing closing parenthesis in function.");
        const fn=FUNCTIONS[t.value.toLowerCase()]; if(!fn) throw new Error("Unknown function: "+t.value);
        const v=fn(...args); if(!Number.isFinite(v)) throw new Error("Function returned a non-finite value."); return v;
      }
      if (t.value.toLowerCase()==="pi") return Math.PI;
      if (t.value.toLowerCase()==="e") return Math.E;
      if (!(t.value in vars)) throw new Error("Unknown variable: "+t.value);
      return vars[t.value];
    }
    throw new Error("Expected a number, variable, or parenthesized expression.");
  }
  function power():number { let v=primary(); if(peek().value==="^"){take();v=Math.pow(v,power());} return v; }
  function term():number { let v=power(); while(peek().value==="*"||peek().value==="/"){const op=take().value;const r=power();v=op==="*"?v*r:v/r;} return v; }
  function expression():number { let v=term(); while(peek().value==="+"||peek().value==="-"){const op=take().value;const r=term();v=op==="+"?v+r:v-r;} return v; }
  const value=expression(); if(peek().kind!=="eof") throw new Error("Unexpected token: "+peek().value);
  if(!Number.isFinite(value)) throw new Error("Formula produced a non-finite result. Check for division by zero.");
  return value;
}
function sample(d: Distribution): number {
  const u=Math.random();
  if(d.type==="fixed") return d.value;
  if(d.type==="uniform") return d.min+u*(d.max-d.min);
  if(d.type==="normal") { const u1=Math.max(Number.EPSILON,Math.random()),u2=Math.random();return d.mean+d.sd*Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2); }
  if(d.type==="triangular") { if(d.max===d.min)return d.min; const f=(d.mode-d.min)/(d.max-d.min);return u<f?d.min+Math.sqrt(u*(d.max-d.min)*(d.mode-d.min)):d.max-Math.sqrt((1-u)*(d.max-d.min)*(d.max-d.mode)); }
  return u<d.probability?d.whenTrue:d.whenFalse;
}
const quantile=(sorted:number[],p:number)=>sorted[Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*p)))];
function corr(a:number[],b:number[]):number {
  const am=a.reduce((x,y)=>x+y,0)/a.length,bm=b.reduce((x,y)=>x+y,0)/b.length;
  let n=0,da=0,db=0;for(let i=0;i<a.length;i++){const x=a[i]-am,y=b[i]-bm;n+=x*y;da+=x*x;db+=y*y;}
  return da&&db?n/Math.sqrt(da*db):0;
}
export function runModel(model: ModelSpec): ModelResult {
  if(!model.name.trim()) throw new Error("Give your model a name.");
  if(!model.variables.length) throw new Error("Add at least one variable.");
  if(!Number.isInteger(model.trials)||model.trials<100||model.trials>100000) throw new Error("Trials must be between 100 and 100,000.");
  const names=new Set<string>();
  for(const v of model.variables){
   if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.name))throw new Error("Variable names must use letters, numbers and underscores.");
   if(names.has(v.name))throw new Error("Variable names must be unique.");names.add(v.name);
   const d=v.distribution;
   if(!d || !["fixed","uniform","normal","triangular","bernoulli"].includes(d.type)) throw new Error("Choose a supported distribution for variable: "+v.name+".");
   const required: Record<string,string[]> = {
     fixed:["value"], uniform:["min","max"], normal:["mean","sd"],
     triangular:["min","mode","max"], bernoulli:["probability","whenTrue","whenFalse"]
   };
   const params = required[d.type].map(key => (d as any)[key]);
   if(params.some(x => typeof x !== "number" || !Number.isFinite(x))) {
     throw new Error("Variable “"+v.name+"” has a missing or invalid "+d.type+" parameter. Enter a finite number for every parameter.");
   }
   if(d.type==="uniform"&&d.min>d.max)throw new Error("Uniform minimum must not exceed its maximum.");
   if(d.type==="normal"&&d.sd<0)throw new Error("Normal distribution standard deviation cannot be negative.");
   if(d.type==="triangular"&&(d.min>d.mode||d.mode>d.max))throw new Error("Triangular distribution needs min ≤ mode ≤ max.");
   if(d.type==="bernoulli"&&(d.probability<0||d.probability>1))throw new Error("Bernoulli probability must be between 0 and 1.");
  }
  const outputs:number[]=[],inputs:Record<string,number[]>={};model.variables.forEach(v=>inputs[v.name]=[]);
  for(let i=0;i<model.trials;i++){const vars:Record<string,number>={};for(const v of model.variables){const value=sample(v.distribution);vars[v.name]=value;inputs[v.name].push(value);}outputs.push(evaluateFormula(model.formula,vars));}
  const sorted=[...outputs].sort((a,b)=>a-b),mean=outputs.reduce((a,b)=>a+b,0)/outputs.length;
  return {name:model.name,formula:model.formula,trials:model.trials,mean,median:quantile(sorted,.5),p05:quantile(sorted,.05),p25:quantile(sorted,.25),p75:quantile(sorted,.75),p95:quantile(sorted,.95),probabilityPositive:outputs.filter(x=>x>0).length/outputs.length,probabilityNegative:outputs.filter(x=>x<0).length/outputs.length,min:sorted[0],max:sorted[sorted.length-1],samples:sorted.filter((_,i)=>i%Math.max(1,Math.floor(sorted.length/100))===0).slice(0,100),sensitivity:model.variables.map(v=>({name:v.name,correlation:corr(inputs[v.name],outputs)})).sort((a,b)=>Math.abs(b.correlation)-Math.abs(a.correlation))};
}
export const EXAMPLES: ModelSpec[] = [
 {name:"Campaign net return",formula:"spend / cpc * conversion_rate * value_per_conversion - spend",trials:10000,variables:[{name:"spend",distribution:{type:"fixed",value:2000}},{name:"cpc",distribution:{type:"uniform",min:6,max:12}},{name:"conversion_rate",distribution:{type:"uniform",min:.015,max:.04}},{name:"value_per_conversion",distribution:{type:"fixed",value:900}}]},
 {name:"Project cost overrun",formula:"planned_cost * (1 + overrun_rate)",trials:10000,variables:[{name:"planned_cost",distribution:{type:"fixed",value:50000}},{name:"overrun_rate",distribution:{type:"triangular",min:0,mode:.08,max:.35}}]},
 {name:"Subscription revenue",formula:"customers * monthly_price * months",trials:10000,variables:[{name:"customers",distribution:{type:"normal",mean:500,sd:70}},{name:"monthly_price",distribution:{type:"fixed",value:299}},{name:"months",distribution:{type:"fixed",value:12}}]}
];