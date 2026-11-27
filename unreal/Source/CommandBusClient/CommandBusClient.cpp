#include "CommandBusClient.h"
#include "WebSocketsModule.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "LevelVariantSetsActor.h"
#include "EngineUtils.h"
#include "Modules/ModuleManager.h"
#include "Camera/CameraActor.h"
#include "Camera/PlayerCameraManager.h"
#include "Kismet/GameplayStatics.h"

IMPLEMENT_MODULE(FDefaultModuleImpl, CommandBusClient);

UCommandBusClient::UCommandBusClient()
{
	PrimaryComponentTick.bCanEverTick = true; // eases the camera towards the requested turn
}

void UCommandBusClient::BeginPlay()
{
	Super::BeginPlay();
	Connect();
	SyncInitialState();
}

void UCommandBusClient::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (Socket.IsValid() && Socket->IsConnected())
	{
		Socket->Close();
	}
	Super::EndPlay(EndPlayReason);
}

void UCommandBusClient::Connect()
{
	if (!FModuleManager::Get().IsModuleLoaded("WebSockets"))
	{
		FModuleManager::Get().LoadModule("WebSockets");
	}

	Socket = FWebSocketsModule::Get().CreateWebSocket(ServerUrl);

	Socket->OnConnected().AddLambda([]()
	{
		UE_LOG(LogTemp, Log, TEXT("[CommandBus] connected"));
	});
	// A failed connect (server not up yet) fires only OnConnectionError, never OnClosed: retry from both.
	auto Retry = [this]()
	{
		FTimerHandle Unused;
		if (UWorld* World = GetWorld())
		{
			World->GetTimerManager().SetTimer(Unused, this, &UCommandBusClient::Connect, 2.0f, false);
		}
	};
	Socket->OnConnectionError().AddLambda([Retry](const FString& Error)
	{
		UE_LOG(LogTemp, Warning, TEXT("[CommandBus] connection error: %s, retrying in 2s"), *Error);
		Retry();
	});
	Socket->OnClosed().AddLambda([Retry](int32, const FString&, bool)
	{
		UE_LOG(LogTemp, Warning, TEXT("[CommandBus] closed, retrying in 2s"));
		Retry();
	});
	Socket->OnMessage().AddUObject(this, &UCommandBusClient::OnMessage);

	Socket->Connect();
}

void UCommandBusClient::OnMessage(const FString& Message)
{
	TSharedPtr<FJsonObject> Json;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
	if (!FJsonSerializer::Deserialize(Reader, Json) || !Json.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("[CommandBus] bad JSON: %s"), *Message);
		return;
	}

	FString Type;
	Json->TryGetStringField(TEXT("type"), Type);

	if (Type == TEXT("set"))
	{
		FString Category, Value;
		if (Json->TryGetStringField(TEXT("category"), Category) && Json->TryGetStringField(TEXT("value"), Value))
		{
			ApplyCommand(Category, Value);
		}
	}
	else if (Type == TEXT("camera"))
	{
		ReadCamera(Json);
	}
	else if (Type == TEXT("moves"))
	{
		const TArray<TSharedPtr<FJsonValue>>* Moves;
		if (Json->TryGetArrayField(TEXT("moves"), Moves))
		{
			ApplyMoves(*Moves);
		}
	}
	else if (Type == TEXT("state"))
	{
		const TSharedPtr<FJsonObject>* Camera;
		if (Json->TryGetObjectField(TEXT("camera"), Camera))
		{
			ReadCamera(*Camera);
		}
		const TArray<TSharedPtr<FJsonValue>>* Moves;
		if (Json->TryGetArrayField(TEXT("moves"), Moves))
		{
			ApplyMoves(*Moves);
		}
		const TSharedPtr<FJsonObject>* StateObj;
		if (Json->TryGetObjectField(TEXT("state"), StateObj))
		{
			for (const auto& Pair : (*StateObj)->Values)
			{
				FString Value;
				if (Pair.Value->TryGetString(Value))
				{
					ApplyCommand(Pair.Key, Value);
				}
			}
		}
	}
}

void UCommandBusClient::ApplyCommand(const FString& Category, const FString& Value)
{
	ALevelVariantSetsActor* Actor = VariantSets.LoadSynchronous();
	if (!Actor && GetWorld())
	{
		TActorIterator<ALevelVariantSetsActor> It(GetWorld());
		Actor = It ? *It : nullptr;
		VariantSets = Actor;
	}
	if (!Actor)
	{
		UE_LOG(LogTemp, Warning, TEXT("[CommandBus] no VariantSets actor assigned, dropping %s=%s"), *Category, *Value);
		return;
	}
	// Category == the Variant Set's name, Value == the Variant's name inside it (see header comment).
	const bool bApplied = Actor->SwitchOnVariantByName(Category, Value);
	UE_LOG(LogTemp, Log, TEXT("[CommandBus] %s = %s (%s)"), *Category, *Value, bApplied ? TEXT("applied") : TEXT("no matching variant"));
}

void UCommandBusClient::ApplyMoves(const TArray<TSharedPtr<FJsonValue>>& Moves)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}
	if (ActorsByName.Num() == 0)
	{
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			for (const FName& Tag : It->Tags)
			{
				ActorsByName.Add(Tag.ToString(), *It);
			}
#if WITH_EDITOR
			if (!ActorsByName.Contains(It->GetActorLabel()))
			{
				ActorsByName.Add(It->GetActorLabel(), *It); // a level built before the tags: the editor's labels
			}
#endif
		}
	}
	int32 Placed = 0, Missing = 0;
	for (const TSharedPtr<FJsonValue>& Value : Moves)
	{
		const TSharedPtr<FJsonObject>* Move;
		const TArray<TSharedPtr<FJsonValue>>* Objects;
		if (!Value.IsValid() || !Value->TryGetObject(Move) || !(*Move)->TryGetArrayField(TEXT("objects"), Objects))
		{
			continue;
		}
		double X = 0, Y = 0, Yaw = 0, Sx = 1, Sy = 1;
		(*Move)->TryGetNumberField(TEXT("x"), X);
		(*Move)->TryGetNumberField(TEXT("y"), Y);
		(*Move)->TryGetNumberField(TEXT("yaw"), Yaw);
		(*Move)->TryGetNumberField(TEXT("sx"), Sx);
		(*Move)->TryGetNumberField(TEXT("sy"), Sy);
		const FTransform Placement(FRotator(0.f, Yaw, 0.f), FVector(X, Y, 0.f), FVector(Sx, Sy, 1.f));
		for (const TSharedPtr<FJsonValue>& Name : *Objects)
		{
			TWeakObjectPtr<AActor>* Actor = ActorsByName.Find(Name->AsString());
			if (Actor && Actor->IsValid())
			{
				(*Actor)->SetActorTransform(Placement);
				++Placed;
			}
			else
			{
				++Missing;
			}
		}
	}
	UE_LOG(LogTemp, Log, TEXT("[CommandBus] moves: %d objects placed, %d not found"), Placed, Missing);
}

void UCommandBusClient::SyncInitialState()
{
	// Belt and braces: the WebSocket "state" message on connect already does this, but a
	// plain HTTP GET works even if the first WS message is missed during a slow connect.
	FString Host = ServerUrl;
	Host.ReplaceInline(TEXT("ws://"), TEXT("http://"));
	Host.ReplaceInline(TEXT("wss://"), TEXT("https://"));

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Host + TEXT("/state"));
	Request->SetVerb(TEXT("GET"));
	Request->OnProcessRequestComplete().BindLambda(
		[this](FHttpRequestPtr, FHttpResponsePtr Response, bool bSuccess)
		{
			if (bSuccess && Response.IsValid() && Response->GetResponseCode() == 200)
			{
				OnMessage(FString::Printf(TEXT("{\"type\":\"state\",\"state\":%s}"), *Response->GetContentAsString()));
			}
		});
	Request->ProcessRequest();
}

void UCommandBusClient::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	// The camera stays where it was placed and only turns: yaw = its own yaw + the slider's angle.
	APlayerCameraManager* Manager = UGameplayStatics::GetPlayerCameraManager(this, 0);
	ACameraActor* Camera = Manager ? Cast<ACameraActor>(Manager->GetViewTarget()) : nullptr;
	if (!Camera)
	{
		return;
	}
	if (!BaseRotation.IsSet())
	{
		BaseRotation = Camera->GetActorRotation();
	}
	if (FMath::IsNearlyEqual(CurrentYaw, TargetYaw, 0.01f) && FMath::IsNearlyEqual(CurrentPitch, TargetPitch, 0.01f))
	{
		return;
	}
	CurrentYaw = FMath::FInterpTo(CurrentYaw, TargetYaw, DeltaTime, CameraTurnSpeed);
	CurrentPitch = FMath::FInterpTo(CurrentPitch, TargetPitch, DeltaTime, CameraTurnSpeed);
	Camera->SetActorRotation(BaseRotation.GetValue() + FRotator(CurrentPitch, CurrentYaw, 0.f));
}

// {"yaw":deg,"pitch":deg}, either may be missing. Same limits as the control server.
void UCommandBusClient::ReadCamera(const TSharedPtr<FJsonObject>& Camera)
{
	double Value;
	if (Camera->TryGetNumberField(TEXT("yaw"), Value))
	{
		TargetYaw = FMath::Clamp(static_cast<float>(Value), -180.f, 180.f);
	}
	if (Camera->TryGetNumberField(TEXT("pitch"), Value))
	{
		TargetPitch = FMath::Clamp(static_cast<float>(Value), -30.f, 30.f);
	}
}
