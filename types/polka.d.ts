declare module "@polka/send" {
  import { ServerResponse } from "http";

  export default function send(
    res: ServerResponse,
    code?: number,
    data?: string,
    headers?: Record<string, string>
  ): void;
}