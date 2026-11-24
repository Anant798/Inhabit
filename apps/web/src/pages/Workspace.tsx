import Navbar from '../components/layout/Navbar';
import Viewport from '../components/viewport/Viewport';
import VoicePanel from '../components/voice/VoicePanel';
import CommandHistory from '../components/commands/CommandHistory';
import ObjectProperties from '../components/properties/ObjectProperties';

const Workspace = () => (
  <div className="flex min-h-screen flex-col md:h-screen md:min-h-0 md:overflow-hidden">
    <Navbar />
    <div className="flex flex-1 flex-col overflow-visible md:min-h-0 md:flex-row md:overflow-hidden">
      {/* Put voice controls first on phones; keep the full workspace on desktop. */}
      <div className="order-1 w-full md:order-2 md:w-80 md:shrink-0">
        <VoicePanel />
      </div>
      <div className="order-2 flex min-w-0 flex-1 flex-col md:order-1 md:min-h-0">
        <div className="h-48 shrink-0 md:h-auto md:min-h-0 md:flex-1">
          <Viewport />
        </div>
        <CommandHistory />
      </div>
      <div className="hidden md:block md:order-3 md:w-72 md:shrink-0">
        <ObjectProperties />
      </div>
    </div>
  </div>
);

export default Workspace;
