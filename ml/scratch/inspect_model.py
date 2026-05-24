import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import TimeSeriesSplit

# Create tiny dataset
X = pd.DataFrame(np.random.rand(100, 5), columns=['a', 'b', 'c', 'd', 'e'])
y = np.random.randint(0, 3, 100)

base_model = xgb.XGBClassifier(n_estimators=10, num_class=3)
tscv = TimeSeriesSplit(n_splits=3)
model = CalibratedClassifierCV(base_model, cv=tscv)
model.fit(X, y)

print(f"Model fitted: {model}")
print(f"Number of calibrated classifiers: {len(model.calibrated_classifiers_)}")

for i, clf in enumerate(model.calibrated_classifiers_):
    print(f"Clf {i} type: {type(clf)}")
    print(f"Clf {i} dir: {dir(clf)}")
    if hasattr(clf, 'base_estimator'):
        print(f"Clf {i} base_estimator: {clf.base_estimator}")
        print(f"Clf {i} importance: {clf.base_estimator.feature_importances_}")
    elif hasattr(clf, 'estimator'):
        print(f"Clf {i} estimator: {clf.estimator}")
        print(f"Clf {i} importance: {clf.estimator.feature_importances_}")
