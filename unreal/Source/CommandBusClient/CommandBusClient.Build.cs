using UnrealBuildTool;

public class CommandBusClient : ModuleRules
{
	public CommandBusClient(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new[]
		{
			"Core", "CoreUObject", "Engine",
			"WebSockets", "HTTP", "Json",
			"VariantManagerContent",
		});
	}
}
