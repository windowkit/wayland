
// Modified for @windowkit/wayland (2026): the `allow-null` attribute on
// arguments, and `isNullable`. See NOTICE.
export interface InterfaceDefinition{
  name: string;
  version: number;
  description: string;
  summary: string;
  requests: RequestDefinition[];
  events: EventDefinition[];
  enums: Record<string, EnumEntry>;
}

export interface RequestDefinition{
  name: string;
  type ?:string;
  since?: number;
  description: string;
  summary: string;
  args: ArgumentDefinition[];
}

export interface CallbackRequest extends RequestDefinition{
  args: [CallbackArgument, ...ArgumentDefinition[]];
}

export function isCallbackRequest(req: RequestDefinition): req is CallbackRequest{
  return req?.args?.length > 0 && isCallbackArgument(req.args[0]);
}

export interface InterfaceCreationRequest extends RequestDefinition{
  args: [InterfaceArgument, ...ArgumentDefinition[]];
}

export function isInterfaceCreationRequest(req: RequestDefinition): req is InterfaceCreationRequest{
  return req?.args?.length > 0 && isInterfaceArgument(req.args[0]);
}

export interface DestructorRequest extends RequestDefinition{
  type: "destructor";
  args: [];
}

export function isDestructorRequest(req: RequestDefinition): req is DestructorRequest{
  return req?.type == "destructor";
}



export interface EventDefinition{
  name: string;
  since?: number;
  description: string;
  summary: string;
  args: ArgumentDefinition[];
}



export interface ArgumentDefinition<T = ArgumentType>{
  /**Argument name */
  name: string;
  /**Argument type */
  type: T;
  /**If the argument is a new_id, name of the interface it creates */
  interface ?:string;
  /** 
   * Short summary of the argument's role.
   * In practice it is always present in the protocol files.
   */
  summary?: string;
  /**
   * The protocol's `allow-null` attribute, as the XML spells it: "true" where
   * an `object` or `string` argument may be null. A null object is the id 0
   * on the wire, and a null string is a length of 0. See {@link isNullable}.
   */
  "allow-null"?: "true" | "false" | boolean;
}

export interface InterfaceArgument extends ArgumentDefinition<"new_id">{
  interface :string;
}
export interface CallbackArgument extends InterfaceArgument{
  interface: "wl_callback";
}

export function isInterfaceArgument(arg: ArgumentDefinition): arg is InterfaceArgument{
  return arg?.type == "new_id"; 
}

export function isCallbackArgument(arg :ArgumentDefinition): arg is CallbackArgument{
  return arg?.type == "new_id" && arg.interface == "wl_callback"
}

/** Whether the protocol lets this argument be null (`allow-null="true"`). */
export function isNullable(arg :ArgumentDefinition) :boolean{
  const v = arg?.["allow-null"];
  return v === true || v === "true";
}

export type EnumDefinition = EnumValue[];

export interface EnumEntry {
  since?: number;
  entries: EnumDefinition;
}

export interface EnumValue{
  name: string;
  value: number;
  summary?: string;
}

export type ArgumentType =
  | "new_id"
  | "fd"
  | "uint"
  | "int"
  | "fixed"
  | "object"
  | "enum"
  | "string"
  | "array";

export type wl_new_id = number;
export type wl_uint = number;
export type wl_int = number;
export type wl_fixed = number;
export type wl_object = number;
export type wl_enum = number;
export type wl_string = string;
export type wl_array = Uint8Array;
/**
 * @warning This is not supported as long as there is no solution for fd transfer
 */
export type wl_fd = number;

/** `null` is a nullable string argument that was null. */
export type wl_arg = wl_new_id|wl_uint|wl_int|wl_fixed|wl_object|wl_enum|wl_string|wl_array|null;

export function wl_arg_as_number(v:wl_arg):wl_new_id|wl_uint|wl_int|wl_fixed|wl_object|wl_enum{
  if(typeof v != "number") throw new Error("Invalid argument type : "+typeof v+" (expected a number)");
  return v;
}

export interface EnumReduction{
  [key: string]: number;
}