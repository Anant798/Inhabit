using UnrealBuildTool;

public class Inhabit : ModuleRules
{
	public Inhabit(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new[]
		{
			"Core", "CoreUObject", "Engine", "InputCore",
			"CommandBusClient",
		});
	}
}
