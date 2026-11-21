const Viewport = () => (
  <div className="flex-1 bg-gray-100 flex flex-col items-center justify-center p-8">
    <div className="w-full h-full bg-white border border-gray-200 rounded-lg shadow-inner flex flex-col items-center justify-center">
      <h2 className="text-2xl font-semibold text-gray-400">3D Viewport</h2>
      <p className="text-gray-400 mt-2">Unreal Engine environment integration will appear here</p>
    </div>
    <div className="mt-4 flex gap-4">
      <button className="bg-white px-4 py-2 border border-gray-300 rounded shadow-sm hover:bg-gray-50">Fullscreen</button>
      <button className="bg-white px-4 py-2 border border-gray-300 rounded shadow-sm hover:bg-gray-50">Reset View</button>
    </div>
  </div>
);

export default Viewport;