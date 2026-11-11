import { ExperimentPage, experimentMetadata } from "../_kit/experiment-page";
import { ReactionDiffusion } from "./reaction-diffusion";

export const metadata = experimentMetadata("reaction-diffusion");

export default function ReactionDiffusionPage() {
  return (
    <ExperimentPage slug="reaction-diffusion">
      <ReactionDiffusion />
    </ExperimentPage>
  );
}
