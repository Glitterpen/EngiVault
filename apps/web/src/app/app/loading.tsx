import {PageState} from "@/components/page-state";

export default function WorkspaceLoading(){
  return <PageState kind="loading" title="Loading workspace…" className="ev-card mx-auto w-full max-w-2xl">
    Your page is on its way. You can still use the navigation.
  </PageState>;
}
