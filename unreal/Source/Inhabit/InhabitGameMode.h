// The room is seen only through the fixed Camera_TV, so no player body is spawned. (The engine's
// default pawn is a grey sphere that appeared half-buried in the floor corner at the world origin.)
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "InhabitGameMode.generated.h"

UCLASS()
class INHABIT_API AInhabitGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AInhabitGameMode() { DefaultPawnClass = nullptr; }
};
