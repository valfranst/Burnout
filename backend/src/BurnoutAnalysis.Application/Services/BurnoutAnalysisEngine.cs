namespace BurnoutAnalysis.Application.Services;

/// <summary>
/// Pure C# burnout analysis engine — server-side fallback.
/// Client-side TensorFlow.js handles trained model inference in the browser.
/// This service handles the static rule-based analysis when no model result is available.
/// </summary>
public static class BurnoutAnalysisEngine
{
    // Min-Max normalization bounds matching the original Node.js model
    // Order: [day_type_bin, work_hours, screen_time_hours, meetings_count,
    //         breaks_taken, after_hours_work_bin, app_switches, sleep_hours,
    //         isolation_index, task_completion, fatigue_score]
    private static readonly float[] FeatureMins = [0, 0.5f, 0, 0, 0, 0, 0, 2, 3, 0, 0];
    private static readonly float[] FeatureMaxs = [1, 18, 18, 16, 20, 1, 10, 10, 9, 100, 10];

    private const float DefaultTaskCompletion = 80f;

    // K-Means centroids (4 behavioural archetypes)
    private static readonly Dictionary<string, float[]> Centroids = new()
    {
        ["Equilibrado"]    = [0.5f, 0.35f, 0.30f, 0.15f, 0.45f, 0.05f, 0.08f, 0.70f, 0.20f, 0.80f, 0.25f],
        ["Sobrecarregado"] = [0.5f, 0.75f, 0.70f, 0.55f, 0.15f, 0.80f, 0.45f, 0.35f, 0.50f, 0.55f, 0.75f],
        ["Isolado"]        = [0.0f, 0.40f, 0.35f, 0.10f, 0.30f, 0.20f, 0.12f, 0.50f, 0.85f, 0.60f, 0.55f],
        ["AltaAutonomia"]  = [0.5f, 0.50f, 0.45f, 0.25f, 0.55f, 0.30f, 0.20f, 0.65f, 0.25f, 0.75f, 0.30f],
    };

    private static readonly float[] DefaultWeights =
        [1.5f, 9.0f, 7.5f, 6.0f, -7.5f, 3.75f, 6.0f, -10.5f, 9.0f, -6.0f, 21.0f];

    public static float[] ExtractFeatures(
        string dayType, float workHours, float screenTimeHours,
        short meetingsCount, short breaksTaken, bool afterHoursWork,
        int appSwitches, float sleepHours, short isolationIndex,
        float taskCompletion, float fatigueScore) =>
    [
        dayType == "Weekday" ? 1f : 0f,
        workHours,
        screenTimeHours,
        meetingsCount,
        breaksTaken,
        afterHoursWork ? 1f : 0f,
        appSwitches,
        sleepHours,
        isolationIndex,
        taskCompletion > 0 ? taskCompletion : DefaultTaskCompletion,
        fatigueScore,
    ];

    public static float[] MinMaxNormalize(float[] features)
    {
        var result = new float[features.Length];
        for (int i = 0; i < features.Length; i++)
        {
            float range = FeatureMaxs[i] - FeatureMins[i];
            result[i] = range > 0 ? (features[i] - FeatureMins[i]) / range : 0f;
        }
        return result;
    }

    public static float CalculateBurnoutScore(float[] normalized, float[]? customWeights = null, float? customBias = null)
    {
        var weights = customWeights?.Length == 11 ? customWeights : DefaultWeights;
        float bias = customBias ?? 15f;
        float dot = 0;
        for (int i = 0; i < normalized.Length; i++)
            dot += normalized[i] * weights[i];
        float raw = dot + bias;
        return MathF.Min(100f, MathF.Max(0f, MathF.Round(raw, 2)));
    }

    public static string ClassifyRisk(float score) => score switch
    {
        < 25f => "Low",
        < 45f => "Medium",
        _ => "High",
    };

    public static string AssignArchetype(float[] normalized)
    {
        string best = "Equilibrado";
        float minDist = float.MaxValue;
        foreach (var (label, centroid) in Centroids)
        {
            float dist = EuclideanDistance(normalized, centroid);
            if (dist < minDist) { minDist = dist; best = label; }
        }
        return best;
    }

    private static float EuclideanDistance(float[] a, float[] b)
    {
        float sum = 0;
        for (int i = 0; i < a.Length; i++)
            sum += (a[i] - b[i]) * (a[i] - b[i]);
        return MathF.Sqrt(sum);
    }

    public static AnalysisResult Analyze(
        string dayType, float workHours, float screenTimeHours,
        short meetingsCount, short breaksTaken, bool afterHoursWork,
        int appSwitches, float sleepHours, short isolationIndex,
        float taskCompletion, float fatigueScore)
    {
        var features = ExtractFeatures(dayType, workHours, screenTimeHours,
            meetingsCount, breaksTaken, afterHoursWork, appSwitches,
            sleepHours, isolationIndex, taskCompletion, fatigueScore);
        var normalized = MinMaxNormalize(features);
        float score = CalculateBurnoutScore(normalized);
        return new AnalysisResult(
            BurnoutScore: score,
            BurnoutRisk: ClassifyRisk(score),
            Archetype: AssignArchetype(normalized),
            ModelUsed: false
        );
    }
}

public record AnalysisResult(float BurnoutScore, string BurnoutRisk, string? Archetype, bool ModelUsed);
