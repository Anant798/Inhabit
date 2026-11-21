import Navbar from '../components/layout/Navbar';
import Viewport from '../components/viewport/Viewport';
import VoicePanel from '../components/voice/VoicePanel';
import CommandHistory from '../components/commands/CommandHistory';
import ObjectProperties from '../components/properties/ObjectProperties';

const Workspace = () => (
  <div className="flex flex-col h-screen overflow-hidden">
    <Navbar />
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 flex flex-col">
        <Viewport />
        <CommandHistory />
      </div>
      <ObjectProperties />
      <VoicePanel />
    </div>
  </div>
);

export default Workspace;
