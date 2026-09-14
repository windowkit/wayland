// Modified for @windowkit/wayland (2026): `allow-null` arguments are typed as
// possibly null, and the generated header imports every `wl_*` type from a
// module that resolves in the published package. See NOTICE.
import { ArgumentDefinition, ArgumentType, EnumDefinition, EnumEntry, EventDefinition, InterfaceDefinition, RequestDefinition, isCallbackArgument, isInterfaceArgument, isNullable } from "./definitions.js";

/**
 * An argument's type in the generated declarations. A request's nullable
 * argument takes null, and an event's nullable string arrives as null; an
 * event's nullable object arrives as the id 0, so its type is unchanged.
 */
function argType(a :ArgumentDefinition, event :boolean) :string{
  const nullable = isNullable(a) && (!event || a.type === "string");
  return `wl_${a.type}${nullable? " | null" : ""}`;
}


/**
 * Every argument type. Declarations spell an argument's type `wl_${type}`, so
 * the header imports each of them; keying the list by ArgumentType makes a new
 * type fail to compile until it is added here.
 */
const argumentTypes = Object.keys({
  new_id: 0, uint: 0, int: 0, fixed: 0, object: 0, enum: 0, string: 0, array: 0, fd: 0,
} satisfies Record<ArgumentType, 0>);

/**
 * `internal` typings are the ones shipped in the package's protocol/. lib/
 * compiles against them and the package does not publish lib/, so they import
 * dist/ through package.json "imports": TypeScript maps "#dist/*" back to lib/
 * while it builds dist/, and to dist/ in an installed package. Anyone else's
 * typings import the package.
 */
export default function makeTypes(interfaces:InterfaceDefinition[], internal = false){
  return ""
  + `import {\n  Wl_interface,\n${argumentTypes.map(t=>`  wl_${t},\n`).join("")}} from "${internal?"#dist/index.js":"@windowkit/wayland"}";\n`
  + interfaces.map(genInterface).join("\n");
}

function indent(str :string, spaces :number) :string{
  return str.split("\n").map(l=> " ".repeat(spaces) + l).join("\n");
}

function comment(str :string|string[]){
  let lines = Array.isArray(str)?str.map(s=>s.replace(/\n$/, "")): str?.split("\n");
  if(!lines) return "";
  // Escape "*/" so a description/summary can't close the surrounding JSDoc block early.
  return lines.map(l=>l.replace(/^\s+/, " ")).join("\n * ").replace(/\*\//g, "*\\/");
}

/** Render a one-line `@summary` JSDoc fragment, collapsing newlines and neutralising comment closers. */
function summaryLine(summary :string|undefined){
  return summary? `\n * @summary ${summary.replace(/\s*\n\s*/g, " ").replace(/\*\//g, "*\\/")}`: "";
}


function nameToClass(name :string){
  return name[0].toUpperCase() + name.slice(1);
}

export const genInterface = ({name, version, description, summary, requests, events, enums} :InterfaceDefinition)=>`
/**${summaryLine(summary)}
 * ${comment(description)}
 */
export interface ${nameToClass(name)} extends Wl_interface{
  name: "${name}";
  version: ${version};
  enums:{
    ${indent(Object.entries(enums??{}).map(([name, en])=>genEnum(name, en.entries)).join(",\n"), 4)}
  }
  
  ${indent(events.map(genEvent).join("\n"), 2)}
  ${indent(requests.map(genRequest).join("\n"), 2)}
}
`;



const genEvent = ({name, description, summary, args} :EventDefinition)=>{
  const first_arg = args[0];
  let params = [];
  if(first_arg && isInterfaceArgument(first_arg)){
    args = args.slice(1);
    params.push(`${first_arg.name}: ${nameToClass(first_arg.interface)}`);
  }
  params.push(...args.map(a=> `${a.name}: ${argType(a, true)}`));
  return `
/**${summaryLine(summary)}
 * ${comment(description)}
 */
on(eventName: "${name}", listener: (${params.join(", ")})=>void): this;
`};



const genRequest = ({name, description, summary, args} :RequestDefinition)=>{
  const first_arg = args[0];
  let returnType = "void";
  if(first_arg && isCallbackArgument(first_arg)){
    args = args.slice(1);
    returnType = "void";
  }else if(first_arg && isInterfaceArgument(first_arg)){
    args = args.slice(1);
    returnType = nameToClass(first_arg.interface);
  }
  return `
/**${summaryLine(summary)}
 * ${comment(description)}
 * ${args.map(a=> `@param ${a.name} ${comment(a.summary ?? "")}`).join("\n * ")}
 */
${name} (${args.map(a=> `${a.name}: ${argType(a, false)}`).join(", ")}) :Promise<${returnType}>;

`};

const genEnum = (name :string, en :EnumDefinition) :string =>`
${name}: [
  ${en.map(({name, value, summary})=>`
  /**${summaryLine(summary)}
   */
  {
    name: "${name}",
    value: ${value},
    summary: ${JSON.stringify(summary ?? "")},
  },
`).join("\n")}
]
`;