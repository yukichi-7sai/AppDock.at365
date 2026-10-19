/** Internal host backdrop; native surfaces retain their own model and lifetime. */
export interface HostModalBackdrop {
  revision: number;
  failed?: true;
  surfaces: {
    id: number;
    image: string;
    bounds: { x: number; y: number; width: number; height: number };
  }[];
}
