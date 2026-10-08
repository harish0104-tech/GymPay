import { Component, type ReactNode } from 'react';
import WorkflowApp from './workflow/WorkflowApp';
class DemoBoundary extends Component<{
    children: ReactNode;
}, {
    failed: boolean;
}> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? <main style={{ padding: 32, fontFamily: 'Arial,sans-serif' }}><h1>Unable to open Gym Pay demo</h1><p>Allow browser storage and reload. If saved demo data is invalid, export or back it up before clearing this site's data.</p><button onClick={() => window.location.reload()}>Reload</button></main> : this.props.children; }
}
export default function App() { return <DemoBoundary><WorkflowApp /></DemoBoundary>; }
