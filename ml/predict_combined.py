import sys
import json
import pickle
import os


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_model(model_file, vectorizer_file):
    model_path = os.path.join(BASE_DIR, model_file)
    vectorizer_path = os.path.join(BASE_DIR, vectorizer_file)

    with open(model_path, "rb") as f:
        model = pickle.load(f)

    with open(vectorizer_path, "rb") as f:
        vectorizer = pickle.load(f)

    return model, vectorizer


def predict(text, model_file, vectorizer_file):
    model, vectorizer = load_model(
        model_file,
        vectorizer_file
    )

    X = vectorizer.transform([text])

    prediction = model.predict(X)[0]

    # Probability of positive class
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(X)[0]

        classes = list(model.classes_)

        if 1 in classes:
            index = classes.index(1)
            probability = float(probabilities[index])
        else:
            probability = float(max(probabilities))
    else:
        probability = 1.0 if prediction else 0.0

    return {
        "prediction": int(prediction),
        "probability": round(probability, 4)
    }


def main():

    if len(sys.argv) < 3:
        print(json.dumps({
            "error": "Missing prediction type or text"
        }))
        return

    prediction_type = sys.argv[1]
    text = sys.argv[2]

    try:

        if prediction_type == "fraud":

            result = predict(
                text,
                "fraud_model.pkl",
                "tfidf_vectorizer.pkl"
            )

        elif prediction_type == "importance":

            result = predict(
                text,
                "importance_model.pkl",
                "importance_vectorizer.pkl"
            )

        else:

            result = {
                "error": "Unknown prediction type"
            }

        print(json.dumps(result))

    except Exception as e:

        print(json.dumps({
            "error": str(e)
        }))


if __name__ == "__main__":
    main()