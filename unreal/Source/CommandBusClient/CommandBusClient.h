// Connects to the control server (control-server/, protocol in docs/command-protocol.md) and applies every {"type":"set",...}
// message to the level's Variant Sets, and every {"type":"moves",...} to the objects moved on the floor plan. Voice and the tablet page both send that same shape;
// this component is the one place Unreal listens.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "GameFramework/Actor.h"
#include "IWebSocket.h"
#include "CommandBusClient.generated.h"

class ALevelVariantSetsActor;

UCLASS(ClassGroup = (Inhabit), meta = (BlueprintSpawnableComponent))
class COMMANDBUSCLIENT_API UCommandBusClient : public UActorComponent
{
	GENERATED_BODY()

public:
	UCommandBusClient();

	// ws://host:port the command bus listens on. Change the host for the showroom PC's address.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Inhabit|Command Bus")
	FString ServerUrl = TEXT("ws://localhost:8787");

	// The level's Variant Sets actor; left empty, the first one in the level is used. Each
	// command-bus "category" (tap, commode, ...) must match a Variant Set name in here exactly,
	// and each "value" (A, B, Grey, Warm, ...) a Variant name inside that set.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Inhabit|Command Bus")
	TSoftObjectPtr<ALevelVariantSetsActor> VariantSets;

	// Look-around ({"type":"camera","yaw":deg,"pitch":deg}): how fast the view eases to the requested angle.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Inhabit|Command Bus")
	float CameraTurnSpeed = 6.f;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	TSharedPtr<IWebSocket> Socket;

	float TargetYaw = 0.f;
	float CurrentYaw = 0.f;
	float TargetPitch = 0.f;
	float CurrentPitch = 0.f;
	void ReadCamera(const TSharedPtr<FJsonObject>& Camera);
	TOptional<FRotator> BaseRotation; // the camera's rotation as placed in the level

	void Connect();
	void OnMessage(const FString& Message);
	// {"type":"moves","moves":[{"objects":[mesh names],"x","y" (cm),"yaw" (deg),"sx","sy"}]}: where each object
	// stands after moves on the 2D floor plan. Every mesh actor is built at the origin with its shape in place,
	// so the placement is its whole transform; an unmoved object gets the identity back.
	void ApplyMoves(const TArray<TSharedPtr<FJsonValue>>& Moves);
	TMap<FString, TWeakObjectPtr<AActor>> ActorsByName; // by tag (build_level.py tags each mesh actor with its name)
	void ApplyCommand(const FString& Category, const FString& Value);
	void SyncInitialState();
};

// Drop one in the level and it listens; the build script (unreal/Scripts) places it.
UCLASS(ClassGroup = (Inhabit))
class COMMANDBUSCLIENT_API ACommandBusActor : public AActor
{
	GENERATED_BODY()

public:
	ACommandBusActor() { Client = CreateDefaultSubobject<UCommandBusClient>(TEXT("CommandBusClient")); }

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Inhabit|Command Bus")
	TObjectPtr<UCommandBusClient> Client;
};
