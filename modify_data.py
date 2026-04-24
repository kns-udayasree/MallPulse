import pandas as pd
import numpy as np

# Load the existing dataset
df = pd.read_csv('multi_floor_mall.csv')

def adjust_population(row):
    mall = row['mall_name']
    # Add some randomness to each
    if mall == 'Inorbit Mall':
        # Heavily crowded (e.g., > 15)
        # Random between 16 and 35
        return np.random.randint(16, 36)
    elif mall == 'South City Mall':
        # Heavily crowded
        return np.random.randint(16, 36)
    elif mall == 'Express Avenue':
        # Moderately crowded (e.g., 6 to 15)
        return np.random.randint(6, 16)
    elif mall == 'Phoenix Palladium':
        # Lightly crowded / Safe (0 to 5)
        return np.random.randint(1, 6)
    elif mall == 'Orion Mall':
        # Lightly crowded / Safe (0 to 5)
        return np.random.randint(1, 6)
    else:
        return row['stall_population']

df['stall_population'] = df.apply(adjust_population, axis=1)

# Save the dataset
df.to_csv('multi_floor_mall.csv', index=False)
print("Data updated successfully.")
