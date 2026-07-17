// Ambient type declarations for non-typed third-party libraries
declare module "msgreader" {
  export default class MsgReader {
    constructor(fileBuffer: any);
    getFileData(): {
      subject?: string;
      body?: string;
      html?: string;
      senderName?: string;
      senderEmail?: string;
    };
  }
}

declare module "pdf-parse" {
  export default function pdf(
    dataBuffer: any,
    options?: any
  ): Promise<{
    text: string;
    numpages: number;
    info: any;
  }>;
}
