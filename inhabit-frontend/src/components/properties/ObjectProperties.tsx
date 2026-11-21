const ObjectProperties = () => (
  <div className="w-72 bg-white border-l border-gray-200 p-6">
    <h3 className="font-semibold text-lg mb-4">Object Properties</h3>
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs text-gray-500 uppercase">Object Name</label>
        <p className="font-medium">Modern Armchair</p>
      </div>
      {['Position', 'Rotation', 'Scale'].map((prop) => (
        <div key={prop}>
          <label className="text-xs text-gray-500 uppercase">{prop}</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {['X', 'Y', 'Z'].map((axis) => (
              <input key={axis} type="number" placeholder={axis} className="bg-gray-50 p-2 rounded border border-gray-200 text-sm" />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default ObjectProperties;