import { ProjectBar } from "@/components/project-bar";

// Star Studio: a gallery of visual and interactive experiments. Everything here
// runs in the browser, so no account or Suspense-wrapped cookie reads needed.

export default function StudioLayout({ children }: LayoutProps<"/studio">) {
  return (
    <>
      <ProjectBar name="STAR STUDIO" href="/studio" color="text-neon-lime">
        <span className="text-sm text-starlight/60">Experiments in light and motion</span>
      </ProjectBar>
      {children}
      <p className="mt-12 text-center text-sm text-starlight/60">
        Everything here runs in your browser. Original code, inspired by ideas from around the web.
      </p>
    </>
  );
}
