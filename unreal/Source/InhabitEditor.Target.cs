using UnrealBuildTool;
using System.Collections.Generic;

public class InhabitEditorTarget : TargetRules
{
	public InhabitEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Inhabit");
	}
}
